import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import type { ConditionOperator, FieldCondition, Mask, VariableBlock } from "@/lib/types";
import type { FieldType, LineMode } from "@/lib/types";
import {
  blocksToTemplate,
  checkboxValue,
  collectFieldDefs,
  composeMultiCheck,
  computedFieldValue,
  initialFieldValue,
  interpolateMask,
  measureDims,
  multiCombinations,
  normalizeMaskVariableName,
  templateToBlocks,
} from "@/lib/maskExecutor";
import { useMaskStore } from "@/hooks/useMaskStore";
import { TemplateEditor, type TemplateEditorHandle } from "./TemplateEditor";
import { t } from "@/lib/i18n";

interface Props {
  /** Existing mask id, or null to create a new mask. */
  maskId: string | null;
  /** Pre-selected area when creating from an area card. */
  initialArea: string | null;
  onClose: () => void;
}

function fieldToken(f: VariableBlock): string {
  return `{{${normalizeMaskVariableName(f.variable_name)}}}`;
}

/** Operators offered for a free-text condition value, in display order. */
const CONDITION_OPERATORS: ConditionOperator[] = ["equals", "contains", "gt", "gte", "lt", "lte"];
const CONDITION_OPERATOR_LABEL: Record<ConditionOperator, string> = {
  equals: "editor.condition_operator_equals",
  contains: "editor.condition_operator_contains",
  gt: "editor.condition_operator_gt",
  gte: "editor.condition_operator_gte",
  lt: "editor.condition_operator_lt",
  lte: "editor.condition_operator_lte",
};

/** Drag payload used to reorder fields, distinct from the plain-text token
 * drag (which drops into the template editor to insert the variable). */
const FIELD_REORDER_MIME = "application/x-fastpath-field-id";

/** Short badge text for a field's type, e.g. "Opções · 3". */
function fieldTypeBadge(f: VariableBlock, lang: Parameters<typeof t>[1]): string {
  if (f.field_type === "select") return `${t("editor.type_select", lang)} · ${f.options?.length ?? 0}`;
  if (f.field_type === "checkbox") return t("editor.type_checkbox", lang);
  if (f.field_type === "multicheck")
    return `${t("editor.type_multicheck", lang)} · ${f.options?.length ?? 0}`;
  if (f.field_type === "measure") return `${t("editor.type_measure", lang)} · ${measureDims(f)}`;
  if (f.field_type === "computed") return t("editor.type_computed", lang);
  return t("editor.type_text", lang);
}

/** A sensible starting condition when a field is picked as a new source. */
function defaultConditionFor(source: VariableBlock): FieldCondition {
  const variable_name = normalizeMaskVariableName(source.variable_name);
  if (source.field_type === "checkbox") {
    // Match the runtime value exactly, line_mode break included — see the
    // checkbox branch of conditionRow for why.
    return { variable_name, operator: "equals", values: [checkboxValue(source, true)] };
  }
  if (source.field_type === "select") {
    return { variable_name, operator: "equals", values: [(source.options ?? [])[0] ?? ""] };
  }
  return { variable_name, operator: "equals", values: [""] };
}

/** First name not already used by `existing`, appending _2, _3… as needed. */
function uniqueFieldName(base: string, existing: VariableBlock[]): string {
  const used = new Set(existing.map((f) => normalizeMaskVariableName(f.variable_name)));
  if (!used.has(normalizeMaskVariableName(base))) return base;
  let i = 2;
  while (used.has(normalizeMaskVariableName(`${base}_${i}`))) i++;
  return `${base}_${i}`;
}

/**
 * A multicheck needs 2^n text boxes; past this many items the table stops being
 * something a person can fill in, so the editor refuses instead of freezing.
 */
const MAX_MULTI_ITEMS = 6;

export function MaskEditorModal({ maskId, initialArea, onClose }: Props) {
  const getMask = useMaskStore((s) => s.getMask);
  const upsertMask = useMaskStore((s) => s.upsertMask);
  const areas = useMaskStore((s) => s.areas);
  const allMasks = useMaskStore((s) => s.masks);
  const lang = useMaskStore((s) => s.settings.language);

  const existing = maskId ? getMask(maskId) : undefined;

  const [id] = useState(() => existing?.id ?? uuid());
  const [name, setName] = useState(existing?.name ?? t("editor.new_mask_name", lang));
  const [area, setArea] = useState(existing?.area ?? initialArea ?? areas[0] ?? "Geral");
  const [category, setCategory] = useState(existing?.category ?? "Geral");
  const [fields, setFields] = useState<VariableBlock[]>(() =>
    existing ? collectFieldDefs(existing.blocks) : [],
  );
  const [template, setTemplate] = useState(() =>
    existing ? blocksToTemplate(existing.blocks) : "",
  );
  // Existing fields start collapsed so big masks open with a clean overview;
  // newly added fields start expanded for immediate editing.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () => new Set(existing ? collectFieldDefs(existing.blocks).map((f) => f.id) : []),
  );
  const templateRef = useRef<TemplateEditorHandle>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importMaskId, setImportMaskId] = useState<string | null>(null);
  const [importSearch, setImportSearch] = useState("");
  const [importSelectedIds, setImportSelectedIds] = useState<Set<string>>(new Set());

  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [dragOverFieldId, setDragOverFieldId] = useState<string | null>(null);

  // Persist continuously so closing the window never loses work.
  useEffect(() => {
    const mask: Mask = {
      id,
      creator_id: existing?.creator_id ?? "local-user",
      name,
      area,
      category,
      blocks: templateToBlocks(template, fields, uuid),
      is_published: existing?.is_published ?? false,
      is_official: existing?.is_official ?? false,
      created_at: existing?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      variables: fields.map((f) => normalizeMaskVariableName(f.variable_name)),
    };
    upsertMask(mask);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, area, category, fields, template]);

  const updateField = (fieldId: string, patch: Partial<VariableBlock>) =>
    setFields((fs) => fs.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)));

  const renameField = (fieldId: string, newName: string) => {
    const field = fields.find((f) => f.id === fieldId);
    if (!field) return;
    const oldToken = fieldToken(field);
    const newToken = `{{${normalizeMaskVariableName(newName) || "campo"}}}`;
    if (oldToken !== newToken) {
      setTemplate((tpl) => tpl.split(oldToken).join(newToken));
    }
    // Other fields may show only when this one matches a value, or a computed
    // field may resolve based on it — keep those conditions pointed at the
    // renamed field instead of silently breaking.
    const oldNorm = normalizeMaskVariableName(field.variable_name);
    const newNorm = normalizeMaskVariableName(newName);
    if (oldNorm !== newNorm) {
      const retarget = (c: FieldCondition | undefined) =>
        c && normalizeMaskVariableName(c.variable_name) === oldNorm
          ? { ...c, variable_name: newNorm }
          : c;
      setFields((fs) =>
        fs.map((x) => ({
          ...x,
          condition: retarget(x.condition),
          computed_condition: retarget(x.computed_condition),
        })),
      );
    }
    updateField(fieldId, { variable_name: newName });
  };

  const addField = () =>
    setFields((fs) => [
      ...fs,
      {
        id: uuid(),
        type: "variable",
        variable_name: `Novo_campo_${fs.length + 1}`,
        field_type: "text",
        required: false,
      },
    ]);

  const removeField = (fieldId: string) =>
    setFields((fs) => {
      const removed = fs.find((f) => f.id === fieldId);
      const removedNorm = removed ? normalizeMaskVariableName(removed.variable_name) : "";
      const clear = (c: FieldCondition | undefined) =>
        c && normalizeMaskVariableName(c.variable_name) === removedNorm ? undefined : c;
      return fs
        .filter((f) => f.id !== fieldId)
        .map((f) => ({ ...f, condition: clear(f.condition), computed_condition: clear(f.computed_condition) }));
    });

  /** Enable/disable/edit a field's "show only when" condition. */
  const setCondition = (fieldId: string, condition: FieldCondition | undefined) =>
    updateField(fieldId, { condition });

  /** Enable/disable/edit a `computed` field's text-resolution condition. */
  const setComputedCondition = (fieldId: string, computed_condition: FieldCondition | undefined) =>
    updateField(fieldId, { computed_condition });

  const toggleCollapsed = (fieldId: string) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });

  const collapseAll = () => setCollapsedIds(new Set(fields.map((f) => f.id)));
  const expandAll = () => setCollapsedIds(new Set());

  /** Subareas already used by other masks in the selected area. */
  const subareaSuggestions = useMemo(() => {
    const seen: string[] = [];
    for (const m of allMasks) {
      if (m.area !== area || m.id === id) continue;
      const sub = m.category?.trim();
      if (sub && !seen.includes(sub)) seen.push(sub);
    }
    return seen;
  }, [allMasks, area, id]);

  /** Drop the field's chip into the template at the caret. */
  const insertToken = (f: VariableBlock) =>
    templateRef.current?.insertVariable(f.variable_name);

  /** Other masks a field can be imported from. */
  const importCandidates = useMemo(
    () => allMasks.filter((m) => m.id !== id),
    [allMasks, id],
  );
  const filteredImportMasks = useMemo(() => {
    const q = importSearch.trim().toLowerCase();
    if (!q) return importCandidates;
    return importCandidates.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.area.toLowerCase().includes(q) ||
        (m.category ?? "").toLowerCase().includes(q),
    );
  }, [importCandidates, importSearch]);
  const importFields = useMemo(() => {
    const m = importMaskId ? allMasks.find((mm) => mm.id === importMaskId) : undefined;
    return m ? collectFieldDefs(m.blocks) : [];
  }, [allMasks, importMaskId]);

  const closeImport = () => {
    setImportOpen(false);
    setImportMaskId(null);
    setImportSelectedIds(new Set());
  };

  const toggleImportSelected = (fieldId: string) =>
    setImportSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });

  /**
   * Copy the selected fields from another mask into this one; the copies are
   * independent. A condition pointing at a field also being imported follows
   * it to its (possibly renamed, to avoid a collision) new name; one pointing
   * at anything else that doesn't already exist here is dropped rather than
   * left dangling.
   */
  const importSelectedFields = (sources: VariableBlock[]) => {
    const existingNames = new Set(fields.map((f) => normalizeMaskVariableName(f.variable_name)));
    const nameMap = new Map<string, string>(); // source's original name -> assigned name
    const clones: VariableBlock[] = [];

    for (const source of sources) {
      const newName = uniqueFieldName(source.variable_name, [...fields, ...clones]);
      nameMap.set(normalizeMaskVariableName(source.variable_name), newName);
      clones.push({ ...source, id: uuid(), variable_name: newName });
    }

    const remap = (c: FieldCondition | undefined): FieldCondition | undefined => {
      if (!c) return undefined;
      const oldNorm = normalizeMaskVariableName(c.variable_name);
      const renamedTo = nameMap.get(oldNorm);
      if (renamedTo) return { ...c, variable_name: normalizeMaskVariableName(renamedTo) };
      return existingNames.has(oldNorm) ? c : undefined;
    };

    setFields((fs) => [
      ...fs,
      ...clones.map((c) => ({
        ...c,
        condition: remap(c.condition),
        computed_condition: remap(c.computed_condition),
      })),
    ]);
    closeImport();
  };

  /** Switch a field's kind, seeding whatever that kind needs to work. */
  const setFieldType = (f: VariableBlock, type: FieldType) => {
    const patch: Partial<VariableBlock> = { field_type: type };
    if ((type === "select" || type === "multicheck") && !f.options?.length) {
      patch.options = [""];
    }
    if (type === "checkbox" && !f.checked_text) {
      patch.checked_text = f.variable_name.replace(/_/g, " ");
    }
    if (type === "measure" && !f.measure_dims) patch.measure_dims = 3;
    updateField(f.id, patch);
  };

  /**
   * A `FieldCondition` editor, shared by "show only when" (field visibility)
   * and "resolve to this text when" (computed fields). The condition holds
   * when the source field's value matches ANY toggle left active (OR) —
   * clicking a toggle only flips that one value in/out.
   */
  const conditionEditor = (
    self: VariableBlock,
    cond: FieldCondition | undefined,
    setCond: (next: FieldCondition | undefined) => void,
    opts: { titleKey: string; addLabel: string; hintKey?: string; showEmptyWarning: boolean },
  ) => {
    const otherFields = fields.filter((x) => x.id !== self.id);

    if (!cond) {
      return (
        <button
          onClick={() => otherFields.length > 0 && setCond(defaultConditionFor(otherFields[0]))}
          disabled={otherFields.length === 0}
          title={otherFields.length === 0 ? t("editor.condition_no_sources", lang) : undefined}
          className="self-start rounded-[10px] bg-sand px-3 py-1.5 text-[11px] font-extrabold text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {opts.addLabel}
        </button>
      );
    }

    const source = otherFields.find(
      (x) => normalizeMaskVariableName(x.variable_name) === normalizeMaskVariableName(cond.variable_name),
    );

    /** Flip one value in/out of the active set; other values are untouched. */
    const toggleValue = (value: string) => {
      const next = cond.values.includes(value)
        ? cond.values.filter((v) => v !== value)
        : [...cond.values, value];
      setCond({ ...cond, values: next });
    };

    const toggleClass = (active: boolean) =>
      `rounded-[10px] px-3 py-1.5 text-[11px] font-extrabold ${
        active ? "bg-brand text-white" : "border border-line bg-card text-muted"
      }`;

    return (
      <div className="flex flex-col gap-2 rounded-[14px] border border-dashed border-mint-line bg-white p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-muted">{t(opts.titleKey, lang)}</span>
          <button
            onClick={() => setCond(undefined)}
            className="border-none bg-transparent text-sm font-bold text-muted hover:text-red-500"
          >
            ×
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {otherFields.map((sf) => (
            <button
              key={sf.id}
              onClick={() => setCond(defaultConditionFor(sf))}
              className={toggleClass(source?.id === sf.id)}
            >
              {sf.variable_name.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        {source?.field_type === "checkbox" && (
          <div className="flex gap-1.5">
            {(
              [
                [checkboxValue(source, true), t("editor.condition_when_checked", lang)],
                [checkboxValue(source, false), t("editor.condition_when_unchecked", lang)],
              ] as [string, string][]
            ).map(([value, label]) => (
              <button key={label} onClick={() => toggleValue(value)} className={toggleClass(cond.values.includes(value))}>
                {label}
              </button>
            ))}
          </div>
        )}

        {source?.field_type === "select" && (
          <div className="flex flex-wrap gap-1.5">
            {(source.options ?? [])
              .filter((o) => o.trim() !== "")
              .map((opt) => (
                <button key={opt} onClick={() => toggleValue(opt)} className={toggleClass(cond.values.includes(opt))}>
                  {opt}
                </button>
              ))}
          </div>
        )}

        {source && source.field_type !== "checkbox" && source.field_type !== "select" && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1">
              {CONDITION_OPERATORS.map((op) => (
                <button
                  key={op}
                  onClick={() => setCond({ ...cond, operator: op })}
                  className={toggleClass(cond.operator === op)}
                >
                  {t(CONDITION_OPERATOR_LABEL[op], lang)}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              {cond.values.map((val, idx) => (
                <div key={idx} className="flex items-center gap-1">
                  <input
                    value={val}
                    onChange={(e) => {
                      const next = [...cond.values];
                      next[idx] = e.target.value;
                      setCond({ ...cond, values: next });
                    }}
                    placeholder={t("editor.condition_value_placeholder", lang)}
                    className="min-w-0 flex-1 rounded-[10px] border border-line bg-card px-3 py-2 text-[13px] font-semibold text-ink outline-none"
                  />
                  <button
                    onClick={() => setCond({ ...cond, values: cond.values.filter((_, i) => i !== idx) })}
                    className="border-none bg-transparent px-1.5 py-0.5 text-sm font-bold text-muted"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                onClick={() => setCond({ ...cond, values: [...cond.values, ""] })}
                className="self-start rounded-[10px] bg-sand px-3 py-1.5 text-[11px] font-extrabold text-ink"
              >
                {t("editor.condition_add_value", lang)}
              </button>
            </div>
          </div>
        )}

        {opts.showEmptyWarning && cond.values.length === 0 && (
          <div className="text-[11px] font-bold text-red-600">
            {t("editor.condition_empty_warning", lang)}
          </div>
        )}

        {opts.hintKey && (
          <div className="text-[11px] font-semibold text-muted/80">{t(opts.hintKey, lang)}</div>
        )}
      </div>
    );
  };

  /** The optional "show only when another field matches this" condition. */
  const conditionRow = (f: VariableBlock) =>
    conditionEditor(f, f.condition, (next) => setCondition(f.id, next), {
      titleKey: "editor.condition_title",
      addLabel: t("editor.condition_add", lang),
      hintKey: "editor.condition_hint",
      showEmptyWarning: true,
    });

  /** `computed` fields: which text they resolve to. */
  const computedConditionRow = (f: VariableBlock) =>
    conditionEditor(f, f.computed_condition, (next) => setComputedCondition(f.id, next), {
      titleKey: "editor.computed_condition_title",
      addLabel: t("editor.computed_condition_add", lang),
      showEmptyWarning: false,
    });

  /**
   * One text box per combination of the field's items. The list is generated
   * from the current items, and existing texts are matched by which items they
   * belong to, so editing the items keeps the texts that still apply.
   */
  const combinationRows = (f: VariableBlock) => {
    const items = (f.options ?? []).filter((o) => o.trim() !== "");
    if (items.length === 0) return null;
    if (items.length > MAX_MULTI_ITEMS) {
      return (
        <div className="text-xs font-bold text-red-600">
          {t("editor.multi_too_many", lang).replace("{n}", String(MAX_MULTI_ITEMS))}
        </div>
      );
    }

    const key = (list: string[]) => [...list].sort().join("");
    const existing = new Map(
      (f.combinations ?? []).map((c) => [key(c.items), c.text] as const),
    );

    const setText = (combo: string[], text: string) => {
      const next = multiCombinations(items).map((c) => ({
        items: c,
        text: key(c) === key(combo) ? text : (existing.get(key(c)) ?? ""),
      }));
      updateField(f.id, { combinations: next });
    };

    return (
      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] font-bold text-muted">
          {t("editor.multi_combinations", lang)}
        </div>
        {multiCombinations(items).map((combo) => (
          <div key={key(combo) || "none"} className="flex items-start gap-2">
            <span
              className={`mt-1.5 w-[190px] flex-shrink-0 truncate text-[11.5px] font-extrabold ${
                combo.length === 0 ? "text-muted/70" : "text-brand"
              }`}
              title={combo.join(" + ")}
            >
              {combo.length === 0 ? t("editor.multi_none", lang) : combo.join(" + ")}
            </span>
            <textarea
              value={existing.get(key(combo)) ?? ""}
              rows={1}
              onChange={(e) => setText(combo, e.target.value)}
              placeholder={t("editor.multi_combination_placeholder", lang)}
              className="min-h-[34px] flex-1 resize-y rounded-[10px] border border-line bg-white px-3 py-2 text-[13px] font-semibold leading-snug text-ink outline-none placeholder:font-normal placeholder:text-muted/70"
            />
          </div>
        ))}
      </div>
    );
  };

  /** The line-mode picker, shared by checkbox and multicheck fields. */
  const lineModeRow = (f: VariableBlock) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-bold text-muted">
        {t("editor.line_mode", lang)}
      </span>
      {(
        [
          ["inline", t("editor.line_mode_inline", lang)],
          ["line", t("editor.line_mode_line", lang)],
          ["paragraph", t("editor.line_mode_paragraph", lang)],
          ["conditional", t("editor.line_mode_conditional", lang)],
        ] as [LineMode, string][]
      ).map(([mode, label]) => (
        <button
          key={mode}
          onClick={() => updateField(f.id, { line_mode: mode })}
          title={mode === "conditional" ? t("editor.line_mode_conditional_hint", lang) : undefined}
          className={`rounded-[10px] px-3 py-1.5 text-[11px] font-extrabold ${
            (f.line_mode ?? "inline") === mode
              ? "bg-brand text-white"
              : "border border-line bg-white text-muted"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const preview = useMemo(() => {
    const values: Record<string, string> = {};
    for (const f of fields) {
      if (f.field_type === "computed") continue; // resolved below, once the rest are known
      const key = normalizeMaskVariableName(f.variable_name);
      const initial = initialFieldValue(f);
      if (initial) {
        values[key] = initial;
      } else if (f.field_type === "measure") {
        // Show the shape of the measurement rather than an empty gap.
        const dims = measureDims(f);
        const boxes = Array.from({ length: dims }, (_, i) => `${i + 1},0`).join(" x ");
        values[key] = f.unit?.trim() ? `${boxes} ${f.unit.trim()}` : boxes;
      } else if (f.field_type === "checkbox") {
        values[key] = checkboxValue(f, true);
      } else if (f.field_type === "multicheck") {
        // Show every item ticked so the author sees the fullest case.
        values[key] = composeMultiCheck(f, f.options ?? []);
      } else {
        values[key] = `[${f.variable_name.replace(/_/g, " ").toLowerCase()}]`;
      }
    }
    for (const f of fields) {
      if (f.field_type !== "computed") continue;
      values[normalizeMaskVariableName(f.variable_name)] = computedFieldValue(f, values);
    }
    return interpolateMask(templateToBlocks(template, fields), values);
  }, [template, fields]);

  const dragProps = (f: VariableBlock) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData("text/plain", fieldToken(f));
      e.dataTransfer.setData(FIELD_REORDER_MIME, f.id);
      e.dataTransfer.effectAllowed = "copyMove";
      setDraggedFieldId(f.id);
    },
    onDragEnd: () => {
      setDraggedFieldId(null);
      setDragOverFieldId(null);
    },
  });

  /** Drop target for reordering: dropping field A onto field B moves A next to B. */
  const reorderTargetProps = (f: VariableBlock) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(FIELD_REORDER_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragOverFieldId !== f.id) setDragOverFieldId(f.id);
    },
    onDragLeave: () => setDragOverFieldId((cur) => (cur === f.id ? null : cur)),
    onDrop: (e: React.DragEvent) => {
      const sourceId = e.dataTransfer.getData(FIELD_REORDER_MIME);
      setDraggedFieldId(null);
      setDragOverFieldId(null);
      if (!sourceId || sourceId === f.id) return;
      e.preventDefault();
      setFields((fs) => {
        const from = fs.findIndex((x) => x.id === sourceId);
        const to = fs.findIndex((x) => x.id === f.id);
        if (from === -1 || to === -1) return fs;
        const next = [...fs];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      });
    },
  });

  return (
    <div className="page-bg fixed inset-0 z-50 overflow-y-auto">
      <div className="w-full px-8 pb-16 pt-6">
        <div className="mb-5 flex items-center justify-between">
          <button onClick={onClose} className="p-0 text-sm font-extrabold text-muted">
            {t("editor.back", lang)}
          </button>
          <div className="flex gap-2">
            <button
              onClick={collapseAll}
              className="rounded-[10px] bg-sand px-3.5 py-2 text-xs font-extrabold text-ink"
            >
              {t("editor.collapse_all", lang)}
            </button>
            <button
              onClick={expandAll}
              className="rounded-[10px] bg-sand px-3.5 py-2 text-xs font-extrabold text-ink"
            >
              {t("editor.expand_all", lang)}
            </button>
          </div>
        </div>

        <div className="mb-5 flex flex-col gap-[18px] rounded-3xl border border-line bg-white p-6 shadow-[0_18px_40px_-22px_rgba(60,40,20,.35)]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border-none py-1 font-display text-2xl font-bold text-ink outline-none"
          />

          <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
            <div>
              <div className="mb-2 text-xs font-bold text-muted">{t("editor.area", lang)}</div>
              <div className="flex flex-wrap gap-2">
                {areas.map((a) => (
                  <button
                    key={a}
                    onClick={() => setArea(a)}
                    className={`rounded-[10px] px-3.5 py-2 text-xs font-extrabold ${
                      area === a
                        ? "bg-brand text-white"
                        : "border border-line bg-card text-ink"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-xs font-bold text-muted">
                {t("editor.subarea", lang)}
              </div>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={t("editor.subarea_placeholder", lang)}
                className="w-[260px] rounded-[14px] border border-line bg-card px-3 py-2 text-[13px] font-bold text-ink outline-none"
              />
              {/* Reuse a subarea already present in this area rather than
                  retyping it (and risking a near-duplicate group). */}
              {subareaSuggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {subareaSuggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => setCategory(s)}
                      className={`rounded-[10px] px-3 py-1.5 text-[11px] font-extrabold ${
                        category === s
                          ? "bg-brand text-white"
                          : "border border-line bg-card text-muted"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-2">
          {/* Left column: fields */}
          <div className="flex flex-col gap-[18px] rounded-3xl border border-line bg-white p-6 shadow-[0_18px_40px_-22px_rgba(60,40,20,.35)]">
            <div>
              <div className="mb-1.5 text-[11.5px] font-extrabold uppercase tracking-[.4px] text-muted">
                {t("editor.fields", lang)}
              </div>
              <div className="mb-1 text-xs font-semibold text-muted">
                {t("editor.fields_hint", lang)}
              </div>
              <div className="mb-2.5 text-xs font-semibold text-muted/80">
                {t("editor.field_text_formatting_hint", lang)}
              </div>
              <div className="flex flex-col gap-2.5">
                {fields.map((f) => {
                  const isCollapsed = collapsedIds.has(f.id);

                  if (isCollapsed) {
                    return (
                      <div
                        key={f.id}
                        {...dragProps(f)}
                        {...reorderTargetProps(f)}
                        onClick={() => toggleCollapsed(f.id)}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-[14px] border px-3.5 py-2.5 ${
                          dragOverFieldId === f.id
                            ? "border-brand bg-mint"
                            : "border-line bg-card"
                        } ${draggedFieldId === f.id ? "opacity-40" : ""}`}
                      >
                        <span className="cursor-grab text-base leading-none text-muted">⠿</span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">
                          {f.variable_name.replace(/_/g, " ")}
                        </span>
                        <span className="flex-shrink-0 rounded-full bg-sand px-2.5 py-1 text-[11px] font-extrabold text-muted">
                          {fieldTypeBadge(f, lang)}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            insertToken(f);
                          }}
                          className="flex-shrink-0 rounded-[10px] bg-mint px-3 py-1.5 text-[11px] font-extrabold text-mint-ink"
                        >
                          {t("editor.insert", lang)}
                        </button>
                        <span className="flex-shrink-0 text-xs text-muted">▸</span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={f.id}
                      {...reorderTargetProps(f)}
                      className={`flex flex-col gap-2.5 rounded-[18px] border p-3.5 ${
                        dragOverFieldId === f.id
                          ? "border-brand bg-mint"
                          : "border-line bg-card"
                      } ${draggedFieldId === f.id ? "opacity-40" : ""}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          {...dragProps(f)}
                          className="cursor-grab text-base leading-none text-muted"
                          title={t("editor.fields_hint", lang)}
                        >
                          ⠿
                        </span>
                        <input
                          value={f.variable_name}
                          onChange={(e) => renameField(f.id, e.target.value)}
                          placeholder={t("editor.field_name", lang)}
                          className="min-w-0 flex-1 rounded-[10px] border border-line bg-white px-3 py-2 text-[13px] font-bold text-ink outline-none"
                        />
                        {(
                          [
                            ["text", t("editor.type_text", lang)],
                            ["select", t("editor.type_select", lang)],
                            ["checkbox", t("editor.type_checkbox", lang)],
                            ["multicheck", t("editor.type_multicheck", lang)],
                            ["measure", t("editor.type_measure", lang)],
                            ["computed", t("editor.type_computed", lang)],
                          ] as [FieldType, string][]
                        ).map(([type, label]) => (
                          <button
                            key={type}
                            onClick={() => setFieldType(f, type)}
                            className={`rounded-[10px] px-3 py-2 text-xs font-extrabold ${
                              (f.field_type === type ||
                                (type === "text" && f.field_type === "textarea"))
                                ? "bg-brand text-white"
                                : "border border-line bg-white text-muted"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                        <button
                          onClick={() => insertToken(f)}
                          className="rounded-[10px] bg-mint px-3 py-2 text-xs font-extrabold text-mint-ink"
                        >
                          {t("editor.insert", lang)}
                        </button>
                        <button
                          onClick={() => toggleCollapsed(f.id)}
                          title={t("editor.collapse_all", lang)}
                          className="border-none bg-transparent text-xs text-muted"
                        >
                          ▾
                        </button>
                        <button
                          onClick={() => removeField(f.id)}
                          className="border-none bg-transparent text-base font-bold text-muted hover:text-red-500"
                        >
                          ×
                        </button>
                      </div>

                      {f.field_type !== "computed" && (
                        <div className="pl-[26px]">{conditionRow(f)}</div>
                      )}

                      {f.field_type === "checkbox" && (
                        <div className="flex flex-col gap-2 pl-[26px]">
                          <div className="text-[11px] font-bold text-muted">
                            {t("editor.checked_text", lang)}
                          </div>
                          <textarea
                            value={f.checked_text ?? ""}
                            rows={1}
                            onChange={(e) =>
                              updateField(f.id, { checked_text: e.target.value })
                            }
                            className="min-h-[34px] w-full resize-y rounded-[10px] border border-line bg-white px-3 py-2 text-[13px] font-semibold leading-snug text-ink outline-none"
                          />
                          <div className="text-[11px] font-bold text-muted">
                            {t("editor.unchecked_text", lang)}
                          </div>
                          <textarea
                            value={f.unchecked_text ?? ""}
                            rows={1}
                            placeholder={t("editor.unchecked_text_placeholder", lang)}
                            onChange={(e) =>
                              updateField(f.id, { unchecked_text: e.target.value })
                            }
                            className="min-h-[34px] w-full resize-y rounded-[10px] border border-line bg-white px-3 py-2 text-[13px] font-semibold leading-snug text-ink outline-none placeholder:font-normal placeholder:text-muted/70"
                          />
                          {lineModeRow(f)}
                          <button
                            onClick={() =>
                              updateField(f.id, { default_checked: !f.default_checked })
                            }
                            className="flex items-center gap-2 self-start text-left"
                          >
                            <span
                              className={`flex h-[20px] w-[20px] items-center justify-center rounded-[6px] text-[12px] font-bold ${
                                f.default_checked
                                  ? "bg-brand text-white"
                                  : "border border-line bg-white text-transparent"
                              }`}
                            >
                              ✓
                            </span>
                            <span className="text-xs font-bold text-muted">
                              {t("editor.default_checked", lang)}
                            </span>
                          </button>
                        </div>
                      )}

                      {f.field_type === "computed" && (
                        <div className="flex flex-col gap-2 pl-[26px]">
                          <div className="text-xs font-semibold text-muted">
                            {t("editor.computed_hint", lang)}
                          </div>
                          {computedConditionRow(f)}
                          <div className="text-[11px] font-bold text-muted">
                            {t("editor.computed_true_text", lang)}
                          </div>
                          <textarea
                            value={f.checked_text ?? ""}
                            rows={1}
                            onChange={(e) => updateField(f.id, { checked_text: e.target.value })}
                            className="min-h-[34px] w-full resize-y rounded-[10px] border border-line bg-white px-3 py-2 text-[13px] font-semibold leading-snug text-ink outline-none"
                          />
                          <div className="text-[11px] font-bold text-muted">
                            {t("editor.computed_false_text", lang)}
                          </div>
                          <textarea
                            value={f.unchecked_text ?? ""}
                            rows={1}
                            onChange={(e) => updateField(f.id, { unchecked_text: e.target.value })}
                            className="min-h-[34px] w-full resize-y rounded-[10px] border border-line bg-white px-3 py-2 text-[13px] font-semibold leading-snug text-ink outline-none"
                          />
                        </div>
                      )}

                      {f.field_type === "multicheck" && (
                        <div className="flex flex-col gap-2.5 pl-[26px]">
                          <div className="text-xs font-semibold text-muted">
                            {t("editor.multicheck_hint", lang)}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(f.options ?? []).map((opt, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-1 rounded-[10px] border border-line bg-white py-1 pl-2.5 pr-1"
                              >
                                <input
                                  value={opt}
                                  onChange={(e) =>
                                    updateField(f.id, {
                                      options: (f.options ?? []).map((o, i) =>
                                        i === idx ? e.target.value : o,
                                      ),
                                    })
                                  }
                                  placeholder={t("editor.multi_item", lang)}
                                  className="w-[150px] border-none bg-transparent text-[13px] font-semibold text-ink outline-none"
                                />
                                <button
                                  onClick={() =>
                                    updateField(f.id, {
                                      options: (f.options ?? []).filter((_, i) => i !== idx),
                                    })
                                  }
                                  className="px-1.5 py-0.5 text-sm font-bold text-muted"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() =>
                                updateField(f.id, { options: [...(f.options ?? []), ""] })
                              }
                              className="rounded-[10px] bg-sand px-3 py-2 text-xs font-extrabold text-ink"
                            >
                              {t("editor.multi_add_item", lang)}
                            </button>
                          </div>
                          {combinationRows(f)}
                          {lineModeRow(f)}
                        </div>
                      )}

                      {f.field_type === "measure" && (
                        <div className="flex flex-wrap items-center gap-4 pl-[26px]">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-muted">
                              {t("editor.measure_dims", lang)}
                            </span>
                            {[1, 2, 3].map((n) => (
                              <button
                                key={n}
                                onClick={() => updateField(f.id, { measure_dims: n })}
                                className={`h-8 w-8 rounded-[10px] text-xs font-extrabold ${
                                  measureDims(f) === n
                                    ? "bg-brand text-white"
                                    : "border border-line bg-white text-muted"
                                }`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-muted">
                              {t("editor.measure_unit", lang)}
                            </span>
                            <input
                              value={f.unit ?? ""}
                              onChange={(e) => updateField(f.id, { unit: e.target.value })}
                              placeholder="cm"
                              className="w-[80px] rounded-[10px] border border-line bg-white px-3 py-2 text-[13px] font-semibold text-ink outline-none"
                            />
                          </div>
                        </div>
                      )}

                      {f.field_type === "select" && (
                        <div className="flex flex-col gap-2 pl-[26px]">
                          {(f.options ?? []).map((opt, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-1 rounded-[10px] border border-line bg-white py-1 pl-2.5 pr-1"
                            >
                              <textarea
                                value={opt}
                                rows={1}
                                onChange={(e) =>
                                  updateField(f.id, {
                                    options: (f.options ?? []).map((o, i) =>
                                      i === idx ? e.target.value : o,
                                    ),
                                  })
                                }
                                placeholder={t("editor.option_placeholder", lang)}
                                className="min-h-[30px] w-full resize-y border-none bg-transparent py-1 text-[13px] font-semibold leading-snug text-ink outline-none"
                              />
                              <button
                                onClick={() =>
                                  updateField(f.id, {
                                    options: (f.options ?? []).filter((_, i) => i !== idx),
                                  })
                                }
                                className="px-1.5 py-0.5 text-sm font-bold text-muted"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() =>
                              updateField(f.id, { options: [...(f.options ?? []), ""] })
                            }
                            className="self-start rounded-[10px] bg-sand px-3 py-2 text-xs font-extrabold text-ink"
                          >
                            {t("editor.add_option", lang)}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  onClick={addField}
                  className="rounded-[14px] bg-sand px-4 py-2.5 text-[13px] font-extrabold text-ink"
                >
                  {t("editor.add_field", lang)}
                </button>
                <button
                  onClick={() => {
                    setImportSearch("");
                    setImportMaskId(null);
                    setImportOpen(true);
                  }}
                  className="rounded-[14px] border border-line bg-card px-4 py-2.5 text-[13px] font-extrabold text-ink"
                >
                  {t("editor.import_field", lang)}
                </button>
              </div>
            </div>
          </div>

          {/* Right column: template + preview, sticky on wide screens */}
          <div className="flex flex-col gap-[18px] self-start rounded-3xl border border-line bg-white p-6 shadow-[0_18px_40px_-22px_rgba(60,40,20,.35)] xl:sticky xl:top-4">
            <div>
              <div className="mb-1.5 text-[11.5px] font-extrabold uppercase tracking-[.4px] text-muted">
                {t("editor.template", lang)}
              </div>
              <TemplateEditor
                ref={templateRef}
                value={template}
                onChange={setTemplate}
                knownNames={fields.map((f) => f.variable_name)}
                placeholder={t("editor.template_placeholder", lang)}
                className="min-h-[260px] w-full overflow-y-auto whitespace-pre-wrap break-words rounded-[14px] border border-dashed border-mint-line bg-card p-3.5 text-sm font-medium leading-relaxed text-ink outline-none empty:before:text-muted/70 empty:before:content-[attr(data-placeholder)]"
              />
            </div>

            <div className="rounded-[18px] border border-mint-line bg-mint p-3.5">
              <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[.4px] text-mint-ink">
                {t("editor.preview", lang)}
              </div>
              <div className="whitespace-pre-wrap text-sm font-semibold leading-relaxed text-ink">
                {preview}
              </div>
            </div>
          </div>
        </div>
      </div>

      {importOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-6"
          onClick={closeImport}
        >
          <div
            className="flex max-h-[80vh] w-[480px] flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              {importMaskId ? (
                <button
                  onClick={() => {
                    setImportMaskId(null);
                    setImportSelectedIds(new Set());
                  }}
                  className="p-0 text-sm font-extrabold text-muted"
                >
                  {t("editor.import_field_back", lang)}
                </button>
              ) : (
                <span className="font-display text-base font-bold text-ink">
                  {t("editor.import_field_title", lang)}
                </span>
              )}
              <button
                onClick={closeImport}
                className="border-none bg-transparent text-lg font-bold text-muted hover:text-red-500"
              >
                ×
              </button>
            </div>

            {!importMaskId && (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-5">
                <input
                  autoFocus
                  value={importSearch}
                  onChange={(e) => setImportSearch(e.target.value)}
                  placeholder={t("editor.import_field_search_placeholder", lang)}
                  className="w-full flex-shrink-0 rounded-[12px] border border-line bg-card px-3.5 py-2.5 text-sm font-semibold text-ink outline-none"
                />
                <div className="flex flex-col gap-1.5 overflow-y-auto">
                  {filteredImportMasks.length === 0 && (
                    <div className="py-6 text-center text-xs font-semibold text-muted">
                      {t("editor.import_field_no_masks", lang)}
                    </div>
                  )}
                  {filteredImportMasks.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setImportMaskId(m.id);
                        setImportSelectedIds(new Set());
                      }}
                      className="flex flex-col items-start rounded-[12px] border border-line bg-card px-3.5 py-2.5 text-left hover:border-brand"
                    >
                      <span className="text-sm font-extrabold text-ink">{m.name}</span>
                      <span className="text-[11px] font-semibold text-muted">
                        {m.area}
                        {m.category ? ` · ${m.category}` : ""} ·{" "}
                        {t("editor.import_field_count", lang).replace(
                          "{n}",
                          String(collectFieldDefs(m.blocks).length),
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {importMaskId && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between px-5 pt-4">
                  <span className="text-[11px] font-semibold text-muted">
                    {t("editor.import_field_selected_count", lang).replace(
                      "{n}",
                      String(importSelectedIds.size),
                    )}
                  </span>
                  <button
                    onClick={() =>
                      setImportSelectedIds((prev) =>
                        prev.size === importFields.length
                          ? new Set()
                          : new Set(importFields.map((f) => f.id)),
                      )
                    }
                    className="p-0 text-[11px] font-extrabold text-brand"
                  >
                    {importSelectedIds.size === importFields.length
                      ? t("editor.import_field_select_none", lang)
                      : t("editor.import_field_select_all", lang)}
                  </button>
                </div>
                <div className="flex flex-col gap-1.5 overflow-y-auto p-5">
                  {importFields.length === 0 && (
                    <div className="py-6 text-center text-xs font-semibold text-muted">
                      {t("editor.import_field_no_fields", lang)}
                    </div>
                  )}
                  {importFields.map((f) => {
                    const selected = importSelectedIds.has(f.id);
                    return (
                      <button
                        key={f.id}
                        onClick={() => toggleImportSelected(f.id)}
                        className={`flex items-center gap-3 rounded-[12px] border px-3.5 py-2.5 text-left ${
                          selected ? "border-brand bg-mint" : "border-line bg-card hover:border-brand"
                        }`}
                      >
                        <span
                          className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[6px] text-[11px] font-bold ${
                            selected ? "bg-brand text-white" : "border border-line bg-white text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">
                          {f.variable_name.replace(/_/g, " ")}
                        </span>
                        <span className="flex-shrink-0 rounded-full bg-sand px-2.5 py-1 text-[11px] font-extrabold text-muted">
                          {fieldTypeBadge(f, lang)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-line p-4">
                  <button
                    onClick={() =>
                      importSelectedFields(importFields.filter((f) => importSelectedIds.has(f.id)))
                    }
                    disabled={importSelectedIds.size === 0}
                    className="w-full rounded-[12px] bg-brand px-4 py-2.5 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("editor.import_field_confirm", lang).replace(
                      "{n}",
                      String(importSelectedIds.size),
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
