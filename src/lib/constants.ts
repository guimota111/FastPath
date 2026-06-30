// FastPath - Shared constants

import type { Plan, UserSettings } from "./types";

/** Trial length in days from sign-up. */
export const TRIAL_DAYS = 15;

/** Max masks a "basic" plan user may own. */
export const BASIC_MASK_LIMIT = 30;

/** Default categories suggested in the builder/marketplace. Users may add more. */
export const DEFAULT_CATEGORIES = [
  "gastro",
  "gineco",
  "hemato",
  "dermato",
  "uro",
  "pulmao",
  "outros",
] as const;

export const DEFAULT_SETTINGS: UserSettings = {
  language: "pt-BR",
  keyByKeyDelay: 12,
  insertMethod: "clipboard",
  hotkeyOpenMenu: "CommandOrControl+Shift+F1",
  hotkeyRunLast: "CommandOrControl+Shift+F2",
  historyLimit: 200,
};

/** Whether the given plan may publish to the marketplace. */
export function canPublish(plan: Plan): boolean {
  return plan === "creator" || plan === "trial";
}

/** Mask quota for a plan (Infinity = unlimited). */
export function maskQuota(plan: Plan): number {
  switch (plan) {
    case "basic":
      return BASIC_MASK_LIMIT;
    case "creator":
    case "trial":
      return Infinity;
  }
}
