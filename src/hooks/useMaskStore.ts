// FastPath - Local-first mask + settings store (Zustand, persisted).

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { HistoryEntry, Mask, UserSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/constants";

interface MaskState {
  masks: Mask[];
  settings: UserSettings;
  history: HistoryEntry[];
  lastUsedMaskId: string | null;

  upsertMask: (mask: Mask) => void;
  deleteMask: (id: string) => void;
  getMask: (id: string) => Mask | undefined;

  updateSettings: (patch: Partial<UserSettings>) => void;

  addHistory: (entry: HistoryEntry) => void;
  clearHistory: () => void;
}

export const useMaskStore = create<MaskState>()(
  persist(
    (set, get) => ({
      masks: [],
      settings: DEFAULT_SETTINGS,
      history: [],
      lastUsedMaskId: null,

      upsertMask: (mask) =>
        set((state) => {
          const idx = state.masks.findIndex((m) => m.id === mask.id);
          if (idx === -1) return { masks: [...state.masks, mask] };
          const next = state.masks.slice();
          next[idx] = mask;
          return { masks: next };
        }),

      deleteMask: (id) =>
        set((state) => ({ masks: state.masks.filter((m) => m.id !== id) })),

      getMask: (id) => get().masks.find((m) => m.id === id),

      updateSettings: (patch) =>
        set((state) => ({ settings: { ...state.settings, ...patch } })),

      addHistory: (entry) =>
        set((state) => {
          const history = [entry, ...state.history].slice(0, state.settings.historyLimit);
          return { history, lastUsedMaskId: entry.mask_id };
        }),

      clearHistory: () => set({ history: [] }),
    }),
    { name: "fastpath-store" },
  ),
);
