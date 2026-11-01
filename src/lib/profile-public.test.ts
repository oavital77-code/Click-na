import { describe, expect, it } from "vitest";
import { isPublicPractice } from "@/lib/profile";

describe("isPublicPractice", () => {
  const live = { status: "active", onboardingCompleted: true, settings: {} };
  it("shows only an active, set-up practice", () => {
    expect(isPublicPractice(live)).toBe(true);
    expect(isPublicPractice(null)).toBe(false);
    expect(isPublicPractice({ ...live, status: "suspended" })).toBe(false);
    expect(isPublicPractice({ ...live, status: "deleted" })).toBe(false);
    expect(isPublicPractice({ ...live, onboardingCompleted: false })).toBe(false);
    expect(isPublicPractice({ ...live, settings: null })).toBe(false);
  });
});
