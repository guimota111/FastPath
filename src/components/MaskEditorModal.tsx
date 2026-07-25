import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import type { Mask, VariableBlock } from "@/lib/types";
import type { FieldType, LineMode } from "@/lib/types";
import {
  blocksToTemplate,
  checkboxCheckedValue,
  collectFieldDefs,
  initialFieldValue,
  interpolateMask,
  measureDims,
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

export function MaskEditorModal({ maskId, initialArea, onClose }: Props) {
  const getMask = useMaskStore((s) => s.getMask);
  const upsertMask = useMaskStore((s) => s.upsertMask);
  const areas = useMaskStore((s) => s.areas);
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
    setFields((fs) => fs.filter((f) => f.id !== fieldId));

  const toggleCollapsed = (fieldId: string) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });

  const collapseAll = () => setCollapsedIds(new Set(fields.map((f) => f.id)));
  const expandAll = () => setCollapsedIds(new Set());

  /** Drop the field's chip into the template at the caret. */
  const insertToken = (f: VariableBlock) =>
    templateRef.current?.insertVariable(f.variable_name);

  /** Switch a field's kind, seeding whatever that kind needs to work. */
  const setFieldType = (f: VariableBlock, type: FieldType) => {
    const patch: Partial<VariableBlock> = { field_type: type };
    if (type === "select" && !f.options?.length) patch.options = [""];
    if (type === "checkbox" && !f.checked_text) {
      patch.checked_text = f.variable_name.replace(/_/g, " ");
    }
    if (type === "measure" && !f.measure_dims) patch.measure_dims = 3;
    updateField(f.id, patch);
  };

  const preview = useMemo(() => {
    const values: Record<string, string> = {};
    for (const f of fields) {
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
        values[key] = checkboxCheckedValue(f);
      } else {
        values[key] = `[${f.variable_name.replace(/_/g, " ").toLowerCase()}]`;
      }
    }
    return interpolateMask(templateToBlocks(template, fields), values);
  }, [template, fields]);

  const dragProps = (f: VariableBlock) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData("text/plain", fieldToken(f));
      e.dataTransfer.effectAllowed = "copy";
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
                {t("editor.category", lang)}
              </div>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-[260px] rounded-[14px] border border-line bg-card px-3 py-2 text-[13px] font-bold text-ink outline-none"
              />
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
              <div className="mb-2.5 text-xs font-semibold text-muted">
                {t("editor.fields_hint", lang)}
              </div>
              <div className="flex flex-col gap-2.5">
                {fields.map((f) => {
                  const isCollapsed = collapsedIds.has(f.id);

                  if (isCollapsed) {
                    return (
                      <div
                        key={f.id}
                        {...dragProps(f)}
                        onClick={() => toggleCollapsed(f.id)}
                        className="flex cursor-pointer items-center gap-2.5 rounded-[14px] border border-line bg-card px-3.5 py-2.5"
                      >
                        <span className="cursor-grab text-base leading-none text-muted">⠿</span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">
                          {f.variable_name.replace(/_/g, " ")}
                        </span>
                        <span className="flex-shrink-0 rounded-full bg-sand px-2.5 py-1 text-[11px] font-extrabold text-muted">
                          {f.field_type === "select"
                            ? `${t("editor.type_select", lang)} · ${f.options?.length ?? 0}`
                            : f.field_type === "checkbox"
                              ? t("editor.type_checkbox", lang)
                              : f.field_type === "measure"
                                ? `${t("editor.type_measure", lang)} · ${measureDims(f)}`
                                : t("editor.type_text", lang)}
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
                      className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-card p-3.5"
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
                            ["measure", t("editor.type_measure", lang)],
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
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-bold text-muted">
                              {t("editor.line_mode", lang)}
                            </span>
                            {(
                              [
                                ["inline", t("editor.line_mode_inline", lang)],
                                ["line", t("editor.line_mode_line", lang)],
                                ["paragraph", t("editor.line_mode_paragraph", lang)],
                              ] as [LineMode, string][]
                            ).map(([mode, label]) => (
                              <button
                                key={mode}
                                onClick={() => updateField(f.id, { line_mode: mode })}
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
              <button
                onClick={addField}
                className="mt-2.5 rounded-[14px] bg-sand px-4 py-2.5 text-[13px] font-extrabold text-ink"
              >
                {t("editor.add_field", lang)}
              </button>
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
                className="min-h-[260px] w-full overflow-y-auto whitespace-pre-wrap break-words rounded-[14px] border border-dashed border-mint-line bg-card p-3.5 text-sm font-semibold leading-relaxed text-ink outline-none empty:before:text-muted/70 empty:before:content-[attr(data-placeholder)]"
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
    </div>
  );
}
