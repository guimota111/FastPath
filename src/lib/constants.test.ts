import { describe, it, expect } from "vitest";
import {
  trialExpiresFrom,
  isTrialActive,
  trialDaysLeft,
  maskQuota,
  canPublish,
  TRIAL_DAYS,
} from "./constants";

describe("trialExpiresFrom", () => {
  it("adds TRIAL_DAYS to the start date", () => {
    const start = new Date("2026-06-30T00:00:00Z");
    const expires = new Date(trialExpiresFrom(start));
    const diffDays = (expires.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(TRIAL_DAYS);
  });
});

describe("isTrialActive", () => {
  const now = new Date("2026-06-30T12:00:00Z");
  it("is true while trial not expired", () => {
    expect(isTrialActive({ plan: "trial", trial_expires: "2026-07-10T00:00:00Z" }, now)).toBe(true);
  });
  it("is false once expired", () => {
    expect(isTrialActive({ plan: "trial", trial_expires: "2026-06-29T00:00:00Z" }, now)).toBe(false);
  });
  it("is false for non-trial plans", () => {
    expect(isTrialActive({ plan: "basic", trial_expires: "2026-07-10T00:00:00Z" }, now)).toBe(false);
    expect(isTrialActive({ plan: "creator", trial_expires: null }, now)).toBe(false);
  });
  it("is false when trial_expires is missing", () => {
    expect(isTrialActive({ plan: "trial", trial_expires: null }, now)).toBe(false);
  });
});

describe("trialDaysLeft", () => {
  const now = new Date("2026-06-30T00:00:00Z");
  it("rounds up remaining days", () => {
    expect(trialDaysLeft({ plan: "trial", trial_expires: "2026-07-05T00:00:00Z" }, now)).toBe(5);
  });
  it("is 0 when expired", () => {
    expect(trialDaysLeft({ plan: "trial", trial_expires: "2026-06-29T00:00:00Z" }, now)).toBe(0);
  });
  it("is 0 for non-trial", () => {
    expect(trialDaysLeft({ plan: "basic", trial_expires: null }, now)).toBe(0);
  });
});

describe("plan helpers", () => {
  it("basic is limited to 30, creator/trial unlimited", () => {
    expect(maskQuota("basic")).toBe(30);
    expect(maskQuota("creator")).toBe(Infinity);
    expect(maskQuota("trial")).toBe(Infinity);
  });
  it("only creator/trial may publish", () => {
    expect(canPublish("creator")).toBe(true);
    expect(canPublish("trial")).toBe(true);
    expect(canPublish("basic")).toBe(false);
  });
});
