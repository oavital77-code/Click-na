import { describe, expect, it } from "vitest";
import { addDaysUtc, zonedDateTimeToUtc } from "@/lib/availability";

describe("addDaysUtc", () => {
  it("adds days within a month", () => {
    expect(addDaysUtc("2026-09-01", 5)).toBe("2026-09-06");
  });

  it("rolls over a month boundary", () => {
    expect(addDaysUtc("2026-09-28", 5)).toBe("2026-10-03");
  });

  it("rolls over a year boundary", () => {
    expect(addDaysUtc("2026-12-30", 5)).toBe("2027-01-04");
  });

  it("handles adding 0 days as a no-op", () => {
    expect(addDaysUtc("2026-09-01", 0)).toBe("2026-09-01");
  });

  it("is independent of the server's own system timezone (spec 6.3)", () => {
    // If this were implemented via the system-local Date reader, running in a
    // negative-UTC-offset environment could shift the result by a day.
    const originalTz = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      expect(addDaysUtc("2026-09-01", 1)).toBe("2026-09-02");
    } finally {
      process.env.TZ = originalTz;
    }
  });
});

describe("zonedDateTimeToUtc", () => {
  it("converts Israel standard time (winter) correctly", () => {
    // Asia/Jerusalem is UTC+2 outside DST.
    const result = zonedDateTimeToUtc("2026-01-15", "09:00", "Asia/Jerusalem");
    expect(result.toISOString()).toBe("2026-01-15T07:00:00.000Z");
  });

  it("converts Israel daylight time (summer) correctly", () => {
    // Asia/Jerusalem is UTC+3 during DST.
    const result = zonedDateTimeToUtc("2026-07-15", "09:00", "Asia/Jerusalem");
    expect(result.toISOString()).toBe("2026-07-15T06:00:00.000Z");
  });

  it("resolves the correct UTC offset on each side of Israel's actual 2026 DST transition", () => {
    // Israel springs forward 2026-03-27 02:00 -> 03:00 (IDT begins).
    const before = zonedDateTimeToUtc("2026-03-20", "09:00", "Asia/Jerusalem");
    const after = zonedDateTimeToUtc("2026-04-03", "09:00", "Asia/Jerusalem");
    expect(before.toISOString()).toBe("2026-03-20T07:00:00.000Z"); // +2
    expect(after.toISOString()).toBe("2026-04-03T06:00:00.000Z"); // +3
  });
});
