import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import type { ExecutionMethod, Mask, TextRun, VariableBlock } from "@/lib/types";
import {
  checkboxValue,
  collectFieldDefs,
  composeMeasure,
  composeMultiCheck,
  computedFieldValue,
  fieldExpectsInput,
  initialFieldValue,
  isFieldVisible,
  measureDims,
  normalizeMaskVariableName,
  renderRuns,
  runsToPlainText,
  splitMeasure,
} from "@/lib/maskExecutor";
import { deliverContent } from "@/lib/tauri";
import { useMaskStore } from "@/hooks/useMaskStore";
import { t } from "@/lib/i18n";
import logo from "@/assets/logo.png";

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
function buildPreview(mask: Mask, values: Record<string, string>): TextRun[] {
  const fields = collectFieldDefs(mask.blocks);
  const merged: Record<string, string> = {};
  for (const f of fields) {
    if (f.field_type === "computed") continue; // resolved below, from raw values
    const key = normalizeMaskVariableName(f.variable_name);
    // A conditionally hidden field never contributed a value the user could
    // see or confirm, so it contributes nothing to the report either.
    if (!isFieldVisible(f, values)) {
      merged[key] = "";
      continue;
    }
    const value = values[key] ?? "";
    merged[key] =
      !value && fieldExpectsInput(f) ? `[${fieldLabel(f).toLowerCase()}]` : value;
  }
  // Computed against the raw values, not the placeholder-filled `merged` —
  // its condition needs the real (possibly empty) value, not a "[label]".
  for (const f of fields) {
    if (f.field_type !== "computed") continue;
    merged[normalizeMaskVariableName(f.variable_name)] = computedFieldValue(f, values);
  }
  return renderRuns(mask.blocks, merged);
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
  const updateSettings = useMaskStore((s) => s.updateSettings);
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
  // Likewise for checkboxes: with an unticked text configured, a non-empty
  // value no longer means "ticked".
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  // Holding Ctrl/Cmd swaps the mask list for the area list, then the category
  // list within the chosen area — a quick way to narrow a long list without
  // typing. Releasing the key returns to the mask list, filtered by whatever
  // was picked; Esc steps back one level instead.
  const [browseMode, setBrowseMode] = useState<"masks" | "groups" | "subgroups">("masks");
  const [filterArea, setFilterArea] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  // Which `select` field's custom option list is open — a plain button + list
  // instead of a native <select>, because the native popup on Windows eats
  // the first Tab press just to close itself (no way to intercept that in
  // JS), which broke moving to the next field in one press.
  const [openSelectKey, setOpenSelectKey] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fieldsContainerRef = useRef<HTMLDivElement>(null);
  const fieldsScrollRef = useRef<HTMLDivElement>(null);

  /**
   * Keep the just-focused field near the top of its scroll area instead of
   * wherever the browser's native "scroll the minimum" would leave it —
   * tabbing through a long mask otherwise pins each new field to the bottom
   * edge, hiding both the field just left and the ones still to come.
   */
  const onFieldsFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const container = fieldsScrollRef.current;
    if (!container) return;
    const margin = 56; // leaves the previous field's label visible above it
    const delta = e.target.getBoundingClientRect().top - container.getBoundingClientRect().top - margin;
    container.scrollBy({ top: delta, behavior: "smooth" });
  };

  // Height the fields pane gets of the fields/preview split, as a percentage
  // of the split area; the rest goes to the preview. Starts from the user's
  // last saved split and is only written back to settings once the drag
  // ends, so the store isn't hammered on every mouse-move.
  // Falls back to 50 in case a stale persisted settings object is still
  // missing this key (see the store's migrate()) — NaN here would silently
  // break every drag from the first pixel of movement.
  const [fieldsPct, setFieldsPct] = useState(settings.previewSplit ?? 50);
  const fieldsPctRef = useRef(fieldsPct);
  fieldsPctRef.current = fieldsPct;
  const splitRef = useRef<HTMLDivElement>(null);

  const onDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = splitRef.current;
    if (!container) return;
    const startY = e.clientY;
    const startPct = fieldsPctRef.current;
    const height = container.getBoundingClientRect().height;

    const onMouseMove = (ev: MouseEvent) => {
      const deltaPct = ((ev.clientY - startY) / height) * 100;
      setFieldsPct(Math.min(85, Math.max(15, startPct + deltaPct)));
    };
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      updateSettings({ previewSplit: fieldsPctRef.current });
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const flat = useMemo(() => {
    const q = search.toLowerCase();
    // Masks persisted by an older version of the schema can be missing a
    // field added later (see the store's migrate()); fall back to "" rather
    // than crash the whole panel on a stray legacy entry.
    const filtered = masks.filter(
      (m) =>
        (!filterArea || m.area === filterArea) &&
        (!filterCategory || m.category === filterCategory) &&
        ((m.name ?? "").toLowerCase().includes(q) ||
          (m.category ?? "").toLowerCase().includes(q) ||
          (m.area ?? "").toLowerCase().includes(q)),
    );
    const order = (a: string) => {
      const i = areas.indexOf(a);
      return i === -1 ? areas.length : i;
    };
    return filtered.slice().sort((a, b) => order(a.area) - order(b.area));
  }, [masks, areas, search, filterArea, filterCategory]);

  const groups = useMemo(() => {
    const seen: string[] = [];
    for (const m of flat) if (!seen.includes(m.area)) seen.push(m.area);
    return seen.map((area) => ({ area, items: flat.filter((m) => m.area === area) }));
  }, [flat]);

  /** Categories in use within `filterArea`, for the "subgroups" browse step. */
  const subgroupsForArea = useMemo(() => {
    if (!filterArea) return [];
    const seen: string[] = [];
    for (const m of masks) {
      if (m.area === filterArea && m.category && !seen.includes(m.category)) {
        seen.push(m.category);
      }
    }
    return seen;
  }, [masks, filterArea]);

  const fields = useMemo(
    () => (selected ? collectFieldDefs(selected.blocks) : []),
    [selected],
  );
  const visibleFields = useMemo(
    () => fields.filter((f) => f.field_type !== "computed" && isFieldVisible(f, values)),
    [fields, values],
  );

  const openMask = (mask: Mask) => {
    const initial: Record<string, string> = {};
    const parts: Record<string, string[]> = {};
    const initialTicked: Record<string, boolean> = {};
    for (const f of collectFieldDefs(mask.blocks)) {
      const key = normalizeMaskVariableName(f.variable_name);
      initial[key] = initialFieldValue(f);
      if (f.field_type === "measure") parts[key] = splitMeasure(initial[key], f);
      if (f.field_type === "checkbox") initialTicked[key] = !!f.default_checked;
    }
    setSelected(mask);
    setValues(initial);
    setMeasureParts(parts);
    setMultiChecked({});
    setTicked(initialTicked);
  };

  const toggleCheckbox = (f: VariableBlock) => {
    const key = normalizeMaskVariableName(f.variable_name);
    const next = !ticked[key];
    setTicked((prev) => ({ ...prev, [key]: next }));
    setValues((v) => ({ ...v, [key]: checkboxValue(f, next) }));
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

  /** First focusable control in the currently open mask's field list. */
  const focusFirstField = () => {
    fieldsContainerRef.current?.querySelector<HTMLElement>("input, select, button")?.focus();
  };

  // Whenever the panel window regains OS focus (hotkey, or clicking back into
  // it), send keyboard focus somewhere useful: the search box in the menu, or
  // the first field if a mask is already open.
  useEffect(() => {
    if (!standalone) return;
    const onFocus = () => (selected ? focusFirstField() : searchRef.current?.focus());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standalone, selected]);

  // Opening a mask jumps straight to its first field instead of leaving focus
  // on whatever menu control was last active.
  useEffect(() => {
    if (selected) focusFirstField();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Tapping Ctrl/Cmd in the menu swaps the mask list for the area list, then
  // (once an area is picked) the category list within it — a fast way to
  // narrow a long list without typing. Tapping it again (from either of
  // those) goes straight back to the (now filtered) mask list. Only while
  // browsing, not while a mask is open and the user is filling it in.
  useEffect(() => {
    if (selected) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return; // ignore auto-repeat from physically holding it
      if (e.key === "Control" || e.key === "Meta") {
        setBrowseMode((m) => (m === "masks" ? "groups" : "masks"));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  // Numpad 1-9 opens the mask at that position in the list, at any time (the
  // physical numpad specifically, so it never collides with typing a search
  // query on the top-row digits).
  useEffect(() => {
    if (selected || browseMode !== "masks") return;
    const onKeyDown = (e: KeyboardEvent) => {
      const match = /^Numpad([1-9])$/.exec(e.code);
      if (!match) return;
      const mask = flat[Number(match[1]) - 1];
      if (mask) openMask(mask);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, browseMode, flat]);

  // Escape steps back one level: out of the category list, out of the area
  // list, out of a mask's form, out of an active group/category filter, and
  // finally (with nothing left to undo) hides the panel.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (browseMode === "subgroups") {
        setBrowseMode("groups");
        setFilterCategory(null);
      } else if (browseMode === "groups") {
        setBrowseMode("masks");
        setFilterArea(null);
        setFilterCategory(null);
      } else if (selected) {
        backToMenu();
      } else if (filterArea || filterCategory) {
        setFilterArea(null);
        setFilterCategory(null);
      } else if (search) {
        setSearch("");
      } else {
        closePanel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, search, standalone, browseMode, filterArea, filterCategory]);

  // The highlighted position resets whenever the visible list changes shape
  // (masks <-> areas <-> categories), so it never points past the new list's
  // end or at a leftover row from a different list.
  useEffect(() => {
    setKeyboardIndex(0);
  }, [browseMode]);

  // Up/down/Enter navigate whichever list is currently showing — masks,
  // areas or categories — no matter which control inside the panel has
  // focus (previously this only worked while the search box itself was
  // focused, so it broke as soon as a group/subgroup click moved focus to
  // that button, and it never worked for the area/category lists at all).
  useEffect(() => {
    if (selected) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const list = browseMode === "groups" ? areas : browseMode === "subgroups" ? subgroupsForArea : flat;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setKeyboardIndex((i) => Math.min(i + 1, list.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setKeyboardIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        if (browseMode === "groups") {
          const area = areas[keyboardIndex];
          if (area) {
            setFilterArea(area);
            setFilterCategory(null);
            setBrowseMode("subgroups");
          }
        } else if (browseMode === "subgroups") {
          const cat = subgroupsForArea[keyboardIndex];
          if (cat) {
            setFilterCategory(cat);
            setBrowseMode("masks");
          }
        } else if (flat[keyboardIndex]) {
          openMask(flat[keyboardIndex]);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, browseMode, flat, areas, subgroupsForArea, keyboardIndex]);

  const execute = async (method: ExecutionMethod) => {
    if (!selected) return;
    // Same rule as the preview: a field hidden by its condition never reaches
    // the report, regardless of whatever value it holds from before.
    const effectiveValues: Record<string, string> = { ...values };
    for (const f of fields) {
      const key = normalizeMaskVariableName(f.variable_name);
      if (f.field_type === "computed") {
        effectiveValues[key] = computedFieldValue(f, values);
      } else if (!isFieldVisible(f, values)) {
        effectiveValues[key] = "";
      }
    }
    const runs = renderRuns(selected.blocks, effectiveValues);
    const content = runsToPlainText(runs);

    // For paste/type the target app must be focused: hide the panel first so
    // the OS returns focus to the previously active window, then deliver.
    if (standalone && method !== "clipboard") {
      await hidePanelWindow();
      await new Promise((r) => setTimeout(r, 400));
    }
    await deliverContent(runs, method, settings);

    addHistory({
      id: uuid(),
      mask_id: selected.id,
      generated_content: content,
      variables_used: effectiveValues,
      timestamp: new Date().toISOString(),
      execution_method: method,
    });
    if (standalone && method === "clipboard") await hidePanelWindow();
    backToMenu();
  };

  // Enter is the definitive "send it" while a mask is open, from anywhere in
  // the form, using whichever output method the user picked as their default.
  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      void execute(settings.insertMethod);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, settings.insertMethod, values]);

  const outputButtons: { key: ExecutionMethod; label: string }[] = [
    { key: "clipboard", label: t("panel.output.copy", lang) },
    { key: "paste", label: t("panel.output.paste", lang) },
    { key: "key-by-key", label: t("panel.output.type", lang) },
  ];

  let runIndex = -1;

  return (
    <div
      className="flex h-screen w-full flex-col overflow-hidden bg-white"
      style={{ animation: "floatIn .3s ease-out" }}
    >
      <div
        data-tauri-drag-region
        className="flex flex-shrink-0 cursor-move items-center gap-2.5 border-b border-line px-5 py-4"
      >
        <div className="pointer-events-none flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[14px] bg-sand">
          <img src={logo} alt="" className="h-[24px] w-[24px] object-contain" />
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
        <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-4">
          <div className="flex flex-shrink-0 items-center gap-2">
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setKeyboardIndex(0);
              }}
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
            <div className="mt-2 flex-shrink-0 text-[11.5px] font-bold text-brand">
              {t("panel.listening", lang)}
            </div>
          )}

          {(filterArea || filterCategory) && browseMode === "masks" && (
            <div className="mt-2 flex flex-shrink-0 items-center gap-1.5">
              <span className="rounded-full bg-sand px-2.5 py-1 text-[11px] font-bold text-ink">
                {filterArea}
                {filterCategory ? ` › ${filterCategory}` : ""}
              </span>
              <button
                onClick={() => {
                  setFilterArea(null);
                  setFilterCategory(null);
                }}
                title={t("panel.clear_filter", lang)}
                className="text-xs font-bold text-muted hover:text-red-500"
              >
                ×
              </button>
            </div>
          )}

          <div className="mt-3.5 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto">
            {browseMode === "groups" ? (
              <>
                <div className="px-1.5 pb-1.5 text-[11px] font-extrabold uppercase tracking-[.6px] text-brand">
                  {t("panel.groups_hint", lang)}
                </div>
                {areas.map((area, i) => (
                  <button
                    key={area}
                    onClick={() => {
                      setFilterArea(area);
                      setFilterCategory(null);
                      setBrowseMode("subgroups");
                    }}
                    onMouseEnter={() => setKeyboardIndex(i)}
                    className={`flex w-full items-center justify-between rounded-[14px] px-3.5 py-3 ${
                      i === keyboardIndex ? "bg-sand" : "bg-transparent"
                    }`}
                  >
                    <span className="text-sm font-bold text-ink">{area}</span>
                    <span className="text-lg text-muted">›</span>
                  </button>
                ))}
              </>
            ) : browseMode === "subgroups" ? (
              <>
                <div className="px-1.5 pb-1.5 text-[11px] font-extrabold uppercase tracking-[.6px] text-brand">
                  {t("panel.subgroups_hint", lang).replace("{area}", filterArea ?? "")}
                </div>
                {subgroupsForArea.map((cat, i) => (
                  <button
                    key={cat}
                    onClick={() => {
                      setFilterCategory(cat);
                      setBrowseMode("masks");
                    }}
                    onMouseEnter={() => setKeyboardIndex(i)}
                    className={`flex w-full items-center justify-between rounded-[14px] px-3.5 py-3 ${
                      i === keyboardIndex || cat === filterCategory ? "bg-sand" : "bg-transparent"
                    }`}
                  >
                    <span className="text-sm font-bold text-ink">{cat}</span>
                  </button>
                ))}
              </>
            ) : (
              groups.map((group) => (
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
                          <span className="flex items-center gap-2.5">
                            {i < 9 && (
                              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[6px] bg-card text-[11px] font-extrabold text-muted">
                                {i + 1}
                              </span>
                            )}
                            <span className="flex flex-col gap-0.5 text-left">
                              <span className="text-sm font-bold text-ink">{mask.name}</span>
                              <span className="text-[11px] font-extrabold uppercase tracking-[.4px] text-muted">
                                {mask.category}
                              </span>
                            </span>
                          </span>
                          <span className="text-lg text-muted">›</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
            {browseMode === "masks" && flat.length === 0 && (
              <div className="px-2 py-5 text-center text-[13px] font-semibold text-muted">
                {t("panel.no_masks", lang)}
              </div>
            )}
          </div>

          <div className="mt-3 flex-shrink-0 text-center text-[11.5px] font-semibold text-muted">
            {t("panel.keys_hint", lang)}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <button
            onClick={backToMenu}
            className="mx-5 mt-4 mb-3.5 flex-shrink-0 self-start p-0 text-[13px] font-extrabold text-muted"
          >
            {t("panel.back", lang)}
          </button>

          {/* Fields pane and (optionally) the report preview, split by a
              draggable divider the user can drag to favor either one. */}
          <div ref={splitRef} className="flex min-h-0 flex-1 flex-col">
          <div
            ref={fieldsScrollRef}
            onFocus={onFieldsFocus}
            style={
              settings.showPreview
                ? { flex: `0 0 calc(${fieldsPct}% - 3px)` }
                : { flex: "1 1 auto" }
            }
            className="min-h-0 overflow-y-auto px-5 pb-3.5"
          >
          <div ref={fieldsContainerRef} className="flex flex-col gap-3.5">
            {visibleFields.map((f) => {
              const key = normalizeMaskVariableName(f.variable_name);

              // Checkboxes carry their own label on the switch row.
              if (f.field_type === "checkbox") {
                const checked = !!ticked[key];
                return (
                  <button
                    key={f.id}
                    onClick={() => toggleCheckbox(f)}
                    className="flex items-center gap-2.5 rounded-[10px] p-1 -m-1 text-left outline-none focus:ring-2 focus:ring-red-500"
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
                            className="flex items-center gap-2.5 rounded-[10px] p-1 -m-1 text-left outline-none focus:ring-2 focus:ring-red-500"
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
                    <div className="relative">
                      <button
                        type="button"
                        onFocus={() => setOpenSelectKey(key)}
                        onBlur={() =>
                          setOpenSelectKey((k) => (k === key ? null : k))
                        }
                        onKeyDown={(e) => {
                          const options = f.options ?? [];
                          const numpadMatch = /^Numpad([1-9])$/.exec(e.nativeEvent.code);
                          if (numpadMatch) {
                            const opt = options[Number(numpadMatch[1]) - 1];
                            if (opt !== undefined) {
                              e.preventDefault();
                              setValues((v) => ({ ...v, [key]: opt }));
                            }
                            return;
                          }
                          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                            e.preventDefault();
                            const idx = options.indexOf(values[key] ?? "");
                            const next =
                              e.key === "ArrowDown"
                                ? options[Math.min(idx + 1, options.length - 1)]
                                : options[Math.max(idx - 1, 0)];
                            if (next !== undefined) setValues((v) => ({ ...v, [key]: next }));
                          }
                          // Tab needs no special handling: this is a plain
                          // button, not a native <select> whose open popup
                          // eats the first Tab press just to close itself.
                        }}
                        className="flex w-full items-center justify-between rounded-[14px] border border-line bg-card px-3.5 py-2.5 text-left text-sm font-semibold text-ink outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500"
                      >
                        <span className="truncate">
                          {(values[key] ?? "").trim() || t("panel.option_none", lang)}
                        </span>
                        <span className="flex-shrink-0 text-muted">⌄</span>
                      </button>
                      {openSelectKey === key && (
                        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-[200px] overflow-y-auto rounded-[14px] border border-line bg-white py-1 shadow-[0_18px_40px_-22px_rgba(60,40,20,.35)]">
                          {(f.options ?? []).map((opt, i) => (
                            <div
                              key={`${i}-${opt}`}
                              // mousedown (not click) fires before the button's
                              // onBlur, so picking an option doesn't first
                              // close the list out from under the click. That
                              // preventDefault also keeps the trigger focused
                              // instead of blurring it, so onBlur never fires
                              // to close the list either — close it here.
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setValues((v) => ({ ...v, [key]: opt }));
                                setOpenSelectKey(null);
                              }}
                              className={`cursor-default px-3.5 py-2 text-sm font-semibold ${
                                opt === (values[key] ?? "") ? "bg-sand text-ink" : "text-ink"
                              }`}
                            >
                              {opt.trim() || t("panel.option_none", lang)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
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
                            className="w-[68px] rounded-[12px] border border-line bg-card px-2.5 py-2 text-center text-sm font-semibold text-ink outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500"
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
                      className="w-full rounded-[14px] border border-line bg-card px-3.5 py-2.5 text-sm font-semibold text-ink outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500"
                    />
                  )}
                </div>
              );
            })}
          </div>
          </div>

          {settings.showPreview && (
            <>
              <div
                onMouseDown={onDividerMouseDown}
                title={t("panel.resize_hint", lang)}
                className="group flex h-[7px] flex-shrink-0 cursor-row-resize items-center justify-center border-y border-line bg-card"
              >
                <div className="h-[3px] w-9 rounded-full bg-line group-hover:bg-brand" />
              </div>

              {/* Report preview, scrollable on its own. */}
              <div
                style={{ flex: `0 0 calc(${100 - fieldsPct}% - 3px)` }}
                className="min-h-0 overflow-y-auto bg-card px-5 py-3.5"
              >
                <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[.4px] text-muted">
                  {t("panel.preview", lang)}
                </div>
                <div className="whitespace-pre-wrap text-sm font-semibold leading-relaxed text-ink">
                  {buildPreview(selected, values).map((run, i) => (
                    <span
                      key={i}
                      className={`${run.bold ? "font-extrabold" : ""} ${
                        run.italic ? "italic" : ""
                      }`}
                    >
                      {run.text}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
          </div>

          <div className="flex flex-shrink-0 gap-2 border-t border-line p-3.5">
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
