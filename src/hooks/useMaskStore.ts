// FastPath - Local-first mask + settings store (Zustand, persisted).

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { HistoryEntry, Mask, MaskBlock, UserSettings } from "@/lib/types";
import { DEFAULT_AREAS, DEFAULT_SETTINGS } from "@/lib/constants";
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
      version: 7,
      migrate: (persisted) => {
        const state = persisted as Partial<MaskState>;
        const settings = { ...DEFAULT_SETTINGS, ...state.settings };
        // v2: the scaffold-era default hotkey (F1) predates the panel window;
        // if it was persisted untouched, move to the current default.
        if (settings.hotkeyOpenMenu === "CommandOrControl+Shift+F1") {
          settings.hotkeyOpenMenu = DEFAULT_SETTINGS.hotkeyOpenMenu;
        }

        // v3-v6 reshaped the Gastro seeds (real checkboxes, line_mode,
        // conditional lines, multicheck). Refresh the copies the user never
        // edited so they pick up the new shape; edited ones are left alone.
        const gastroSeeds = buildGastroMasks();
        const seedById = new Map(gastroSeeds.map((m) => [m.id, m]));
        const masks = (state.masks ?? []).map((m) => {
          const seed = seedById.get(m.id);
          if (seed && !m.updated_at) return seed; // never edited locally
          return { ...m, area: m.area || "Geral", blocks: liftCheckboxLineBreaks(m.blocks) };
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
