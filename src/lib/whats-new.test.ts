import { describe, expect, it } from "vitest";
import { showWhatsNew } from "@/lib/whats-new";

const published = new Date("2026-11-13T00:00:00Z");
const before = new Date("2026-10-01T00:00:00Z");
const after = new Date("2026-11-20T00:00:00Z");

describe("showWhatsNew", () => {
  it("shows once to an account that was here before the notice", () => {
    expect(showWhatsNew({ createdAt: before, whatsNewSeenAt: null, onboardingCompleted: true }, published)).toBe(true);
    expect(showWhatsNew({ createdAt: before, whatsNewSeenAt: after, onboardingCompleted: true }, published)).toBe(false);
  });

  it("shows a newer notice to somebody who closed an older one", () => {
    expect(showWhatsNew({ createdAt: before, whatsNewSeenAt: before, onboardingCompleted: true }, published)).toBe(true);
  });

  it("never shows to an account created after it, or one still in setup", () => {
    expect(showWhatsNew({ createdAt: after, whatsNewSeenAt: null, onboardingCompleted: true }, published)).toBe(false);
    expect(showWhatsNew({ createdAt: before, whatsNewSeenAt: null, onboardingCompleted: false }, published)).toBe(false);
  });
});
