// FastPath - Local-first mask + settings store (Zustand, persisted).

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ConditionOperator,
  HistoryEntry,
  Mask,
  MaskBlock,
  UserSettings,
  VariableBlock,
} from "@/lib/types";
import { DEFAULT_AREAS, DEFAULT_SETTINGS } from "@/lib/constants";
import { checkboxValue, normalizeMaskVariableName } from "@/lib/maskExecutor";
import { buildSeedMasks } from "@/lib/seedMasks";
import { GASTRO_AREA, buildGastroMasks } from "@/lib/seedMasksGastro";

interface MaskState {
  masks: Mask[];
  areas: string[];
  /**
   * Seed packs already installed, so a pack the user deleted is never
   * reinstalled by a later migration.
   */
  seededPacks: string[];
  settings: UserSettings;
  history: HistoryEntry[];
  lastUsedMaskId: string | null;

  upsertMask: (mask: Mask) => void;
  deleteMask: (id: string) => void;
  getMask: (id: string) => Mask | undefined;

  addArea: (name: string) => void;
  renameArea: (from: string, to: string) => void;
  /** Remove an area and every mask filed under it. */
  deleteArea: (name: string) => void;

  updateSettings: (patch: Partial<UserSettings>) => void;

  addHistory: (entry: HistoryEntry) => void;
  clearHistory: () => void;
}

/** Seed packs shipped with the app, tracked so deletions stick. */
const GASTRO_PACK = "gastro-guilisahk";

/**
 * Field visibility conditions shipped with a single `value`; they moved to an
 * OR'd `values` list so more than one toggle can be active. Lift any
 * still-persisted single-value condition into the new shape.
 */
function migrateFieldConditions(blocks: MaskBlock[]): MaskBlock[] {
  return blocks.map((block) => {
    if (block.type === "conditional") {
      return { ...block, blocks: migrateFieldConditions(block.blocks) };
    }
    if (block.type === "variable" && block.condition && !("values" in block.condition)) {
      const old = block.condition as unknown as {
        variable_name: string;
        operator: ConditionOperator;
        value: string;
      };
      return {
        ...block,
        condition: { variable_name: old.variable_name, operator: old.operator, values: [old.value] },
      };
    }
    return block;
  });
}

/**
 * A field condition sourced from a checkbox compared against its raw
 * `checked_text`/`unchecked_text`, but the panel actually stores that text
 * with the checkbox's `line_mode` break prepended (see `checkboxValue`) — so
 * a condition on a checkbox using "line" or "paragraph" mode never matched.
 * Rewrite any condition value that is really the un-prefixed text to the
 * value the panel actually produces; a no-op for "inline" checkboxes, where
 * the prefix is empty anyway.
 */
function migrateCheckboxConditionValues(blocks: MaskBlock[]): MaskBlock[] {
  const byName = new Map<string, VariableBlock>();
  const collect = (bs: MaskBlock[]) => {
    for (const b of bs) {
      if (b.type === "variable") byName.set(normalizeMaskVariableName(b.variable_name), b);
      else if (b.type === "conditional") collect(b.blocks);
    }
  };
  collect(blocks);

  const fix = (bs: MaskBlock[]): MaskBlock[] =>
    bs.map((block) => {
      if (block.type === "conditional") return { ...block, blocks: fix(block.blocks) };
      if (block.type !== "variable" || !block.condition) return block;
      const source = byName.get(normalizeMaskVariableName(block.condition.variable_name));
      if (source?.field_type !== "checkbox") return block;

      const rawChecked = source.checked_text ?? "";
      const rawUnchecked = source.unchecked_text ?? "";
      const realChecked = checkboxValue(source, true);
      const realUnchecked = checkboxValue(source, false);
      const values = block.condition.values.map((v) => {
        if (v === rawChecked && rawChecked !== realChecked) return realChecked;
        if (v === rawUnchecked && rawUnchecked !== realUnchecked) return realUnchecked;
        return v;
      });
      return { ...block, condition: { ...block.condition, values } };
    });

  return fix(blocks);
}

/**
 * Rewrite locally edited checkboxes that still hide their line break inside
 * `checked_text` (how they were stored before `line_mode` existed), so the
 * editor shows the break as a choice rather than an invisible character.
 */
function liftCheckboxLineBreaks(blocks: MaskBlock[]): MaskBlock[] {
  return blocks.map((block) => {
    if (block.type === "conditional") {
      return { ...block, blocks: liftCheckboxLineBreaks(block.blocks) };
    }
    if (
      block.type !== "variable" ||
      block.field_type !== "checkbox" ||
      block.line_mode !== undefined ||
      !block.checked_text?.startsWith("\n")
    ) {
      return block;
    }
    const paragraph = block.checked_text.startsWith("\n\n");
    return {
      ...block,
      line_mode: paragraph ? "paragraph" : "line",
      checked_text: block.checked_text.replace(/^\n+/, ""),
    };
  });
}

export const useMaskStore = create<MaskState>()(
  persist(
    (set, get) => ({
      masks: buildSeedMasks(),
      // Only a starting point: the user may rename or delete any of these.
      areas: [...DEFAULT_AREAS],
      seededPacks: [GASTRO_PACK],
      settings: DEFAULT_SETTINGS,
      history: [],
      lastUsedMaskId: null,

      upsertMask: (mask) =>
        set((state) => {
          const idx = state.masks.findIndex((m) => m.id === mask.id);
          const masks =
            idx === -1
              ? [...state.masks, mask]
              : state.masks.map((m, i) => (i === idx ? mask : m));
          const areas = state.areas.includes(mask.area)
            ? state.areas
            : [...state.areas, mask.area];
          return { masks, areas };
        }),

      deleteMask: (id) =>
        set((state) => ({ masks: state.masks.filter((m) => m.id !== id) })),

      getMask: (id) => get().masks.find((m) => m.id === id),

      addArea: (name) =>
        set((state) => {
          const trimmed = name.trim();
          if (!trimmed || state.areas.includes(trimmed)) return {};
          return { areas: [...state.areas, trimmed] };
        }),

      renameArea: (from, to) =>
        set((state) => {
          const trimmed = to.trim();
          if (!trimmed || trimmed === from || state.areas.includes(trimmed)) return {};
          return {
            areas: state.areas.map((a) => (a === from ? trimmed : a)),
            masks: state.masks.map((m) => (m.area === from ? { ...m, area: trimmed } : m)),
          };
        }),

      deleteArea: (name) =>
        set((state) => ({
          areas: state.areas.filter((a) => a !== name),
          // Masks live inside their area; leaving them behind would make them
          // unreachable in the library.
          masks: state.masks.filter((m) => m.area !== name),
        })),

      updateSettings: (patch) =>
        set((state) => ({ settings: { ...state.settings, ...patch } })),

      addHistory: (entry) =>
        set((state) => {
          const history = [entry, ...state.history].slice(0, state.settings.historyLimit);
          return { history, lastUsedMaskId: entry.mask_id };
        }),

      clearHistory: () => set({ history: [] }),
    }),
    {
      name: "fastpath-store",
      // v11: field visibility conditions moved from a single `value` to an
      // OR'd `values` list (see migrateFieldConditions) after v10 shipped.
      // v12: checkbox-sourced field conditions compared against the wrong,
      // un-prefixed text (see migrateCheckboxConditionValues) after v11 shipped.
      version: 12,
      migrate: (persisted) => {
        const state = persisted as Partial<MaskState>;
        const settings = { ...DEFAULT_SETTINGS, ...state.settings };
        // v2: the scaffold-era default hotkey (F1) predates the panel window;
        // if it was persisted untouched, move to the current default.
        if (settings.hotkeyOpenMenu === "CommandOrControl+Shift+F1") {
          settings.hotkeyOpenMenu = DEFAULT_SETTINGS.hotkeyOpenMenu;
        }

        // v3-v8 reshaped the Gastro seeds (real checkboxes, line_mode,
        // conditional lines, per-combination multicheck texts). Refresh the
        // copies the user never edited so they pick up the new shape; edited
        // ones are left alone.
        const gastroSeeds = buildGastroMasks();
        const seedById = new Map(gastroSeeds.map((m) => [m.id, m]));
        const masks = (state.masks ?? []).map((m) => {
          const seed = seedById.get(m.id);
          if (seed && !m.updated_at) return seed; // never edited locally
          return {
            ...m,
            area: m.area || "Geral",
            // v9: masks persisted before `category` existed never got one.
            category: m.category || "Geral",
            blocks: migrateCheckboxConditionValues(
              migrateFieldConditions(liftCheckboxLineBreaks(m.blocks)),
            ),
          };
        });

        // v7: install the Gastro pack once and remember it, so masks (or the
        // whole area) the user deleted are not brought back by this migration.
        const seededPacks = [...(state.seededPacks ?? [])];
        const areas = [...(state.areas ?? DEFAULT_AREAS)];
        if (!seededPacks.includes(GASTRO_PACK)) {
          const existingIds = new Set(masks.map((m) => m.id));
          for (const gastro of gastroSeeds) {
            if (!existingIds.has(gastro.id)) masks.push(gastro);
          }
          if (!areas.includes(GASTRO_AREA)) areas.push(GASTRO_AREA);
          seededPacks.push(GASTRO_PACK);
        }

        return { ...state, areas, masks, seededPacks, settings } as MaskState;
      },
    },
  ),
);

// The main window and the floating-panel window are separate webviews sharing
// the same localStorage. Rehydrate when the OTHER window writes the store so
// masks/settings edited in one window show up in the other.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "fastpath-store") {
      void useMaskStore.persist.rehydrate();
    }
  });
}
