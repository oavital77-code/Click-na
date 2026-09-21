import { describe, expect, it } from "vitest";
import { blockedDates, daysInHebrewYear, isHebrewLeapYear, israeliHolidays } from "@/lib/holidays";

function dates(year: number, key: string) {
  return israeliHolidays(year).filter((h) => h.key === key).map((h) => h.date);
}

describe("Hebrew calendar arithmetic", () => {
  it("knows leap years and year lengths", () => {
    expect(isHebrewLeapYear(5784)).toBe(true);
    expect(isHebrewLeapYear(5786)).toBe(false);
    expect([353, 354, 355, 383, 384, 385]).toContain(daysInHebrewYear(5786));
    expect(daysInHebrewYear(5787)).toBeGreaterThanOrEqual(383); // 5787 is a leap year
  });
});

describe("israeliHolidays against published dates", () => {
  it("Rosh Hashana 5786 and 5787", () => {
    expect(dates(2025, "roshHashana")).toEqual(["2025-09-23", "2025-09-24"]);
    expect(dates(2026, "roshHashana")).toEqual(["2026-09-12", "2026-09-13"]);
  });

  it("Yom Kippur", () => {
    expect(dates(2025, "yomKippur")).toEqual(["2025-10-02"]);
    expect(dates(2026, "yomKippur")).toEqual(["2026-09-21"]);
  });

  it("Pesach, first and seventh day", () => {
    expect(dates(2026, "pesach")).toEqual(["2026-04-02"]);
    expect(dates(2026, "shviiPesach")).toEqual(["2026-04-08"]);
    expect(dates(2027, "pesach")).toEqual(["2027-04-22"]);
  });

  it("Shavuot and Sukkot", () => {
    expect(dates(2026, "shavuot")).toEqual(["2026-05-22"]);
    expect(dates(2026, "sukkot")).toEqual(["2026-09-26"]);
    expect(dates(2026, "shminiAtzeret")).toEqual(["2026-10-03"]);
  });

  it("Yom HaAtzmaut moves off Shabbat and Friday, and Yom HaZikaron sits the day before", () => {
    // 5 Iyar 5785 fell on Shabbat, 3 May 2025 → observed Thursday 1 May.
    expect(dates(2025, "yomHaatzmaut")).toEqual(["2025-05-01"]);
    expect(dates(2025, "yomHazikaron")).toEqual(["2025-04-30"]);
    // 5 Iyar 5786 is a Wednesday, no move.
    expect(dates(2026, "yomHaatzmaut")).toEqual(["2026-04-22"]);
  });

  it("eves land the day before, once, including Erev Rosh Hashana across the year boundary", () => {
    expect(dates(2026, "erevRoshHashana")).toEqual(["2026-09-11"]);
    expect(dates(2026, "erevYomKippur")).toEqual(["2026-09-20"]);
    expect(dates(2026, "erevPesach")).toEqual(["2026-04-01"]);
  });

  it("chol hamoed is the days between, and one kind per date", () => {
    expect(dates(2026, "cholHamoedPesach")).toEqual(["2026-04-03", "2026-04-04", "2026-04-05", "2026-04-06"]);
    const all = israeliHolidays(2026).map((h) => h.date);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("blockedDates", () => {
  it("closes only what the policy says", () => {
    const strict = blockedDates({ blockHolidays: true, blockHolidayEves: false, blockCholHamoed: false }, [2026]);
    expect(strict.has("2026-09-21")).toBe(true); // Yom Kippur
    expect(strict.has("2026-09-20")).toBe(false); // its eve
    expect(strict.has("2026-04-03")).toBe(false); // chol hamoed
    const everything = blockedDates({ blockHolidays: true, blockHolidayEves: true, blockCholHamoed: true }, [2026]);
    expect(everything.has("2026-09-20")).toBe(true);
    expect(everything.has("2026-04-03")).toBe(true);
    expect(blockedDates({ blockHolidays: false, blockHolidayEves: false, blockCholHamoed: false }, [2026]).size).toBe(0);
  });
});
