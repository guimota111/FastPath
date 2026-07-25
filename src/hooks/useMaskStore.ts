// FastPath - Local-first mask + settings store (Zustand, persisted).

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { HistoryEntry, Mask, UserSettings } from "@/lib/types";
import { DEFAULT_AREAS, DEFAULT_SETTINGS } from "@/lib/constants";
import { buildSeedMasks } from "@/lib/seedMasks";
import { GASTRO_AREA, buildGastroMasks } from "@/lib/seedMasksGastro";

interface MaskState {
  masks: Mask[];
  areas: string[];
  settings: UserSettings;
  history: HistoryEntry[];
  lastUsedMaskId: string | null;

  upsertMask: (mask: Mask) => void;
  deleteMask: (id: string) => void;
  getMask: (id: string) => Mask | undefined;

  addArea: (name: string) => void;

  updateSettings: (patch: Partial<UserSettings>) => void;

  addHistory: (entry: HistoryEntry) => void;
  clearHistory: () => void;
}

export const useMaskStore = create<MaskState>()(
  persist(
    (set, get) => ({
      masks: buildSeedMasks(),
      areas: [...DEFAULT_AREAS],
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
      version: 3,
      migrate: (persisted) => {
        const state = persisted as Partial<MaskState>;
        const settings = { ...DEFAULT_SETTINGS, ...state.settings };
        // v2: the scaffold-era default hotkey (F1) predates the panel window;
        // if it was persisted untouched, move to the current default.
        if (settings.hotkeyOpenMenu === "CommandOrControl+Shift+F1") {
          settings.hotkeyOpenMenu = DEFAULT_SETTINGS.hotkeyOpenMenu;
        }

        // v3: add the Gastro masks ported from GuilisAHK. Only masks whose id
        // is not present yet are added, so local edits are never overwritten.
        const masks = (state.masks ?? []).map((m) => ({ ...m, area: m.area || "Geral" }));
        const existingIds = new Set(masks.map((m) => m.id));
        for (const gastro of buildGastroMasks()) {
          if (!existingIds.has(gastro.id)) masks.push(gastro);
        }

        const areas = state.areas?.length ? [...state.areas] : [...DEFAULT_AREAS];
        if (!areas.includes(GASTRO_AREA)) areas.push(GASTRO_AREA);

        return { ...state, areas, masks, settings } as MaskState;
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
