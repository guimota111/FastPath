import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import type { ExecutionMethod, Mask, VariableBlock } from "@/lib/types";
import {
  checkboxCheckedValue,
  collectFieldDefs,
  composeMeasure,
  composeMultiCheck,
  fieldExpectsInput,
  initialFieldValue,
  interpolateMask,
  measureDims,
  normalizeMaskVariableName,
  splitMeasure,
} from "@/lib/maskExecutor";
import { deliverContent } from "@/lib/tauri";
import { useMaskStore } from "@/hooks/useMaskStore";
import { t } from "@/lib/i18n";

const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Hide this (panel) window so focus returns to the previously active app. */
async function hidePanelWindow() {
  if (!IS_TAURI) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().hide();
  } catch (e) {
    console.error("hide panel failed:", e);
  }
}

function fieldLabel(f: VariableBlock): string {
  return f.variable_name.replace(/_/g, " ");
}

/**
 * Interpolate with `[label]` placeholders for text fields the user hasn't
 * filled yet. Select fields always hold a chosen value — an empty one means
 * "omit this part", so it must render as nothing.
 */
function buildPreview(mask: Mask, values: Record<string, string>): string {
  const merged: Record<string, string> = {};
  for (const f of collectFieldDefs(mask.blocks)) {
    const key = normalizeMaskVariableName(f.variable_name);
    const value = values[key] ?? "";
    merged[key] =
      !value && fieldExpectsInput(f) ? `[${fieldLabel(f).toLowerCase()}]` : value;
  }
  return interpolateMask(mask.blocks, merged);
}

interface Props {
  /** True when rendered inside the dedicated always-on-top panel window. */
  standalone?: boolean;
}

export function FloatingPanel({ standalone = false }: Props) {
  const masks = useMaskStore((s) => s.masks);
  const areas = useMaskStore((s) => s.areas);
  const settings = useMaskStore((s) => s.settings);
  const addHistory = useMaskStore((s) => s.addHistory);
  const lang = settings.language;

  const [search, setSearch] = useState("");
  const [keyboardIndex, setKeyboardIndex] = useState(0);
  const [voiceListening, setVoiceListening] = useState(false);
  const [selected, setSelected] = useState<Mask | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [measureParts, setMeasureParts] = useState<Record<string, string[]>>({});
  // Which items of each `multicheck` field are ticked. Kept apart from `values`
  // because the composed sentence cannot say which items produced it.
  const [multiChecked, setMultiChecked] = useState<Record<string, string[]>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  const flat = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = masks.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.area.toLowerCase().includes(q),
    );
    const order = (a: string) => {
      const i = areas.indexOf(a);
      return i === -1 ? areas.length : i;
    };
    return filtered.slice().sort((a, b) => order(a.area) - order(b.area));
  }, [masks, areas, search]);

  const groups = useMemo(() => {
    const seen: string[] = [];
    for (const m of flat) if (!seen.includes(m.area)) seen.push(m.area);
    return seen.map((area) => ({ area, items: flat.filter((m) => m.area === area) }));
  }, [flat]);

  const fields = useMemo(
    () => (selected ? collectFieldDefs(selected.blocks) : []),
    [selected],
  );

  const openMask = (mask: Mask) => {
    const initial: Record<string, string> = {};
    const parts: Record<string, string[]> = {};
    for (const f of collectFieldDefs(mask.blocks)) {
      const key = normalizeMaskVariableName(f.variable_name);
      initial[key] = initialFieldValue(f);
      if (f.field_type === "measure") parts[key] = splitMeasure(initial[key], f);
    }
    setSelected(mask);
    setValues(initial);
    setMeasureParts(parts);
    setMultiChecked({});
  };

  /** Tick or untick one item of a `multicheck` field and recompose its phrase. */
  const toggleMultiItem = (f: VariableBlock, option: string) => {
    const key = normalizeMaskVariableName(f.variable_name);
    const current = multiChecked[key] ?? [];
    const next = current.includes(option)
      ? current.filter((o) => o !== option)
      : [...current, option];
    setMultiChecked((prev) => ({ ...prev, [key]: next }));
    setValues((v) => ({ ...v, [key]: composeMultiCheck(f, next) }));
  };

  /**
   * Update one box of a `measure` field. The boxes are tracked separately from
   * the joined value because joining discards which box was left empty.
   */
  const setMeasurePart = (f: VariableBlock, index: number, part: string) => {
    const key = normalizeMaskVariableName(f.variable_name);
    const parts: string[] = [
      ...(measureParts[key] ?? Array(measureDims(f)).fill("")),
    ];
    parts[index] = part;
    setMeasureParts((prev) => ({ ...prev, [key]: parts }));
    setValues((v) => ({ ...v, [key]: composeMeasure(parts, f.unit) }));
  };

  const backToMenu = () => {
    setSelected(null);
    setSearch("");
    setKeyboardIndex(0);
  };

  const closePanel = () => {
    backToMenu();
    if (standalone) void hidePanelWindow();
  };

  // Refocus the search box whenever the panel window regains focus (hotkey).
  useEffect(() => {
    if (!standalone) return;
    const onFocus = () => searchRef.current?.focus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [standalone]);

  // Escape anywhere: leave the form, or hide the panel window from the menu.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selected) backToMenu();
      else if (!search) closePanel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, search, standalone]);

  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setKeyboardIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setKeyboardIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (flat[keyboardIndex]) openMask(flat[keyboardIndex]);
    } else if (e.key === "Escape" && search) {
      setSearch("");
    }
  };

  const execute = async (method: ExecutionMethod) => {
    if (!selected) return;
    const content = interpolateMask(selected.blocks, values);

    // For paste/type the target app must be focused: hide the panel first so
    // the OS returns focus to the previously active window, then deliver.
    if (standalone && method !== "clipboard") {
      await hidePanelWindow();
      await new Promise((r) => setTimeout(r, 400));
    }
    await deliverContent(content, method, settings.keyByKeyDelay);

    addHistory({
      id: uuid(),
      mask_id: selected.id,
      generated_content: content,
      variables_used: values,
      timestamp: new Date().toISOString(),
      execution_method: method,
    });
    if (standalone && method === "clipboard") await hidePanelWindow();
    backToMenu();
  };

  const outputButtons: { key: ExecutionMethod; label: string }[] = [
    { key: "clipboard", label: t("panel.output.copy", lang) },
    { key: "paste", label: t("panel.output.paste", lang) },
    { key: "key-by-key", label: t("panel.output.type", lang) },
  ];

  let runIndex = -1;

  return (
    <div
      className="w-[380px] overflow-hidden rounded-3xl border border-line bg-white shadow-[0_18px_40px_-22px_rgba(60,40,20,.35)]"
      style={{ animation: "floatIn .3s ease-out" }}
    >
      <div
        data-tauri-drag-region
        className="flex cursor-move items-center gap-2.5 border-b border-line px-5 py-4"
      >
        <div className="pointer-events-none flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[14px] bg-sand">
          <span className="font-display text-sm font-bold text-brand">F</span>
        </div>
        <div className="pointer-events-none min-w-0 flex-1">
          <div className="truncate font-display text-[17px] font-bold text-ink">
            {selected ? selected.name : t("app.name", lang)}
          </div>
          <div className="text-xs font-semibold text-muted">
            {selected ? selected.category : t("panel.subtitle_menu", lang)}
          </div>
        </div>
        <div
          className="h-2 w-2 flex-shrink-0 rounded-full bg-brand"
          title={t("settings.always_on_top", lang)}
        />
        {standalone && (
          <button
            onClick={closePanel}
            title={t("panel.close", lang)}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[10px] bg-sand text-sm font-bold text-muted hover:text-red-500"
          >
            ×
          </button>
        )}
      </div>

      {!selected ? (
        <div className="px-5 pb-5 pt-4">
          <div className="flex items-center gap-2">
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setKeyboardIndex(0);
              }}
              onKeyDown={onSearchKeyDown}
              placeholder={t("panel.search_placeholder", lang)}
              className="flex-1 rounded-[14px] border border-line bg-card px-3.5 py-2.5 text-sm font-semibold text-ink outline-none placeholder:text-muted/70"
            />
            <button
              onClick={() => setVoiceListening((v) => !v)}
              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[14px] ${
                voiceListening
                  ? "animate-pulseMic bg-brand text-white"
                  : "bg-sand text-muted"
              }`}
              title={t("settings.voice", lang)}
            >
              <div className="h-[15px] w-[9px] rounded-[5px] bg-current" />
            </button>
          </div>
          {voiceListening && (
            <div className="mt-2 text-[11.5px] font-bold text-brand">
              {t("panel.listening", lang)}
            </div>
          )}

          <div className="mt-3.5 flex max-h-[300px] flex-col gap-2.5 overflow-y-auto">
            {groups.map((group) => (
              <div key={group.area}>
                <div className="px-1.5 pb-1.5 text-[11px] font-extrabold uppercase tracking-[.6px] text-brand">
                  {group.area}
                </div>
                <div className="flex flex-col gap-1">
                  {group.items.map((mask) => {
                    runIndex += 1;
                    const i = runIndex;
                    return (
                      <button
                        key={mask.id}
                        onClick={() => openMask(mask)}
                        onMouseEnter={() => setKeyboardIndex(i)}
                        className={`flex w-full items-center justify-between rounded-[14px] px-3.5 py-3 ${
                          i === keyboardIndex ? "bg-sand" : "bg-transparent"
                        }`}
                      >
                        <span className="flex flex-col gap-0.5 text-left">
                          <span className="text-sm font-bold text-ink">{mask.name}</span>
                          <span className="text-[11px] font-extrabold uppercase tracking-[.4px] text-muted">
                            {mask.category}
                          </span>
                        </span>
                        <span className="text-lg text-muted">›</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {flat.length === 0 && (
              <div className="px-2 py-5 text-center text-[13px] font-semibold text-muted">
                {t("panel.no_masks", lang)}
              </div>
            )}
          </div>

          <div className="mt-3 text-center text-[11.5px] font-semibold text-muted">
            {t("panel.keys_hint", lang)}
          </div>
        </div>
      ) : (
        <div className="px-5 pb-5 pt-4">
          <button
            onClick={backToMenu}
            className="mb-3.5 p-0 text-[13px] font-extrabold text-muted"
          >
            {t("panel.back", lang)}
          </button>

          <div className="flex max-h-[320px] flex-col gap-3.5 overflow-y-auto">
            {fields.map((f) => {
              const key = normalizeMaskVariableName(f.variable_name);

              // Checkboxes carry their own label on the switch row.
              if (f.field_type === "checkbox") {
                const checked = (values[key] ?? "") !== "";
                return (
                  <button
                    key={f.id}
                    onClick={() =>
                      setValues((v) => ({
                        ...v,
                        [key]: checked ? "" : checkboxCheckedValue(f),
                      }))
                    }
                    className="flex items-center gap-2.5 text-left"
                  >
                    <span
                      className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-[7px] text-[13px] font-bold ${
                        checked ? "bg-brand text-white" : "border border-line bg-card text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span className="text-[13px] font-bold leading-snug text-ink">
                      {fieldLabel(f)}
                    </span>
                  </button>
                );
              }

              return (
                <div key={f.id}>
                  <div className="mb-1.5 text-xs font-extrabold uppercase tracking-[.4px] text-muted">
                    {fieldLabel(f)}
                  </div>

                  {f.field_type === "multicheck" ? (
                    <div className="flex flex-col gap-1.5">
                      {(f.options ?? []).map((option, i) => {
                        const ticked = (multiChecked[key] ?? []).includes(option);
                        return (
                          <button
                            key={`${i}-${option}`}
                            onClick={() => toggleMultiItem(f, option)}
                            className="flex items-center gap-2.5 text-left"
                          >
                            <span
                              className={`flex h-[20px] w-[20px] flex-shrink-0 items-center justify-center rounded-[6px] text-[12px] font-bold ${
                                ticked
                                  ? "bg-brand text-white"
                                  : "border border-line bg-card text-transparent"
                              }`}
                            >
                              ✓
                            </span>
                            <span className="text-[13px] font-bold leading-snug text-ink">
                              {option}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : f.field_type === "select" ? (
                    (() => {
                      const options = f.options ?? [];
                      // Paragraph-long options need full-width stacked rows;
                      // short ones read better as inline chips.
                      const stacked = options.some((o) => o.length > 48);
                      return (
                        <div
                          className={
                            stacked ? "flex flex-col gap-1.5" : "flex flex-wrap gap-2"
                          }
                        >
                          {options.map((opt, i) => (
                            <button
                              key={`${i}-${opt}`}
                              onClick={() => setValues((v) => ({ ...v, [key]: opt }))}
                              className={`text-[13px] font-bold ${
                                stacked
                                  ? "w-full whitespace-pre-wrap rounded-[12px] px-3 py-2 text-left leading-snug"
                                  : "rounded-full px-3.5 py-2"
                              } ${
                                values[key] === opt
                                  ? "bg-brand text-white shadow-[0_10px_18px_-8px_rgba(40,199,111,.70)]"
                                  : "bg-sand text-ink"
                              }`}
                            >
                              {opt.trim() || t("panel.option_none", lang)}
                            </button>
                          ))}
                        </div>
                      );
                    })()
                  ) : f.field_type === "measure" ? (
                    <div className="flex items-center gap-2">
                      {Array.from({ length: measureDims(f) }, (_, i) => (
                        <div key={i} className="flex items-center gap-2">
                          {i > 0 && (
                            <span className="text-sm font-bold text-muted">×</span>
                          )}
                          <input
                            inputMode="decimal"
                            value={measureParts[key]?.[i] ?? ""}
                            onChange={(e) => setMeasurePart(f, i, e.target.value)}
                            className="w-[68px] rounded-[12px] border border-line bg-card px-2.5 py-2 text-center text-sm font-semibold text-ink outline-none"
                          />
                        </div>
                      ))}
                      {f.unit?.trim() && (
                        <span className="text-[13px] font-bold text-muted">
                          {f.unit.trim()}
                        </span>
                      )}
                    </div>
                  ) : (
                    <input
                      value={values[key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                      placeholder={f.default ?? ""}
                      className="w-full rounded-[14px] border border-line bg-card px-3.5 py-2.5 text-sm font-semibold text-ink outline-none"
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-[18px] border border-line bg-card p-3.5">
            <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[.4px] text-muted">
              {t("panel.preview", lang)}
            </div>
            <div className="whitespace-pre-wrap text-sm font-semibold leading-relaxed text-ink">
              {buildPreview(selected, values)}
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            {outputButtons.map((btn) => (
              <button
                key={btn.key}
                onClick={() => execute(btn.key)}
                className={`flex-1 rounded-[14px] p-3 text-[13px] font-extrabold ${
                  settings.insertMethod === btn.key
                    ? "bg-brand text-white shadow-[0_10px_18px_-8px_rgba(40,199,111,.70)]"
                    : "bg-sand text-ink"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
