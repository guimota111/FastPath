import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import type { Mask, VariableBlock } from "@/lib/types";
import {
  blocksToTemplate,
  collectFieldDefs,
  interpolateMask,
  normalizeMaskVariableName,
  templateToBlocks,
} from "@/lib/maskExecutor";
import { useMaskStore } from "@/hooks/useMaskStore";
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
  const templateRef = useRef<HTMLTextAreaElement>(null);

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

  const onTemplateDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const text = e.dataTransfer.getData("text/plain");
    if (!text) return;
    const el = templateRef.current;
    const start = el?.selectionStart ?? template.length;
    const end = el?.selectionEnd ?? template.length;
    setTemplate((tpl) => tpl.slice(0, start) + text + tpl.slice(end));
  };

  const preview = useMemo(() => {
    const values: Record<string, string> = {};
    for (const f of fields) {
      const key = normalizeMaskVariableName(f.variable_name);
      const first = f.field_type === "select" ? f.options?.[0] : undefined;
      values[key] = first || `[${f.variable_name.replace(/_/g, " ").toLowerCase()}]`;
    }
    return interpolateMask(templateToBlocks(template, fields), values);
  }, [template, fields]);

  return (
    <div className="page-bg fixed inset-0 z-50 overflow-y-auto">
      <div className="mx-auto max-w-[900px] px-10 pb-16 pt-7">
        <div className="mb-5 flex items-center justify-between">
          <button onClick={onClose} className="p-0 text-sm font-extrabold text-muted">
            {t("editor.back", lang)}
          </button>
        </div>

        <div className="flex flex-col gap-[22px] rounded-3xl border border-line bg-white p-7 shadow-[0_18px_40px_-22px_rgba(60,40,20,.35)]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border-none py-1 font-display text-2xl font-bold text-ink outline-none"
          />

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

          <div>
            <div className="mb-1.5 text-[11.5px] font-extrabold uppercase tracking-[.4px] text-muted">
              {t("editor.fields", lang)}
            </div>
            <div className="mb-2.5 text-xs font-semibold text-muted">
              {t("editor.fields_hint", lang)}
            </div>
            <div className="flex flex-col gap-2.5">
              {fields.map((f) => (
                <div
                  key={f.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", fieldToken(f))}
                  className="flex cursor-grab flex-col gap-2.5 rounded-[18px] border border-line bg-card p-3.5"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base leading-none text-muted" title={t("editor.fields_hint", lang)}>
                      ⠿
                    </span>
                    <input
                      value={f.variable_name}
                      onChange={(e) => renameField(f.id, e.target.value)}
                      placeholder={t("editor.field_name", lang)}
                      className="flex-1 rounded-[10px] border border-line bg-white px-3 py-2 text-[13px] font-bold text-ink outline-none"
                    />
                    <button
                      onClick={() => updateField(f.id, { field_type: "text" })}
                      className={`rounded-[10px] px-3.5 py-2 text-xs font-extrabold ${
                        f.field_type !== "select"
                          ? "bg-brand text-white"
                          : "border border-line bg-white text-muted"
                      }`}
                    >
                      {t("editor.type_text", lang)}
                    </button>
                    <button
                      onClick={() =>
                        updateField(f.id, {
                          field_type: "select",
                          options: f.options?.length ? f.options : [""],
                        })
                      }
                      className={`rounded-[10px] px-3.5 py-2 text-xs font-extrabold ${
                        f.field_type === "select"
                          ? "bg-brand text-white"
                          : "border border-line bg-white text-muted"
                      }`}
                    >
                      {t("editor.type_select", lang)}
                    </button>
                    <button
                      onClick={() => removeField(f.id)}
                      className="border-none bg-transparent text-base font-bold text-muted"
                    >
                      ×
                    </button>
                  </div>

                  {f.field_type === "select" && (
                    <div className="flex flex-wrap gap-2 pl-[26px]">
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
                            placeholder={t("editor.option_placeholder", lang)}
                            className="w-[140px] border-none bg-transparent text-[13px] font-semibold text-ink outline-none"
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
                        {t("editor.add_option", lang)}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addField}
              className="mt-2.5 rounded-[14px] bg-sand px-4 py-2.5 text-[13px] font-extrabold text-ink"
            >
              {t("editor.add_field", lang)}
            </button>
          </div>

          <div>
            <div className="mb-1.5 text-[11.5px] font-extrabold uppercase tracking-[.4px] text-muted">
              {t("editor.template", lang)}
            </div>
            <textarea
              ref={templateRef}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onTemplateDrop}
              className="min-h-[120px] w-full resize-y rounded-[14px] border border-dashed border-mint-line bg-card p-3.5 text-sm font-semibold leading-relaxed text-ink outline-none"
            />
          </div>

          <div className="rounded-[18px] border border-mint-line bg-mint p-3.5">
            <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[.4px] text-mint-ink">
              {t("editor.preview", lang)}
            </div>
            <div className="text-sm font-semibold leading-relaxed text-ink">{preview}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
