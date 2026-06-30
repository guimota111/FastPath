// FastPath - Shared constants

import type { Plan, User, UserSettings } from "./types";

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

/** ISO timestamp `TRIAL_DAYS` after the given start date. */
export function trialExpiresFrom(start: Date): string {
  const expires = new Date(start);
  expires.setDate(expires.getDate() + TRIAL_DAYS);
  return expires.toISOString();
}

/** Whether a user's trial is still active (relative to `now`). */
export function isTrialActive(user: Pick<User, "plan" | "trial_expires">, now = new Date()): boolean {
  if (user.plan !== "trial") return false;
  if (!user.trial_expires) return false;
  return new Date(user.trial_expires).getTime() > now.getTime();
}

/** Days left in the trial (0 if expired or not on trial). */
export function trialDaysLeft(
  user: Pick<User, "plan" | "trial_expires">,
  now = new Date(),
): number {
  if (user.plan !== "trial" || !user.trial_expires) return 0;
  const ms = new Date(user.trial_expires).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}
