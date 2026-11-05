import { describe, expect, it } from "vitest";
import { blockedDates, israeliHolidays } from "@/lib/holidays";

const on = (year: number, key: string) => israeliHolidays(year).filter((h) => h.key === key).map((h) => h.date);

describe("observances on the calendar (published dates)", () => {
  it("Hanukkah: eight days", () => {
    // 2025 holds the tail of one Hanukkah (25 Dec 2024 – 2 Jan 2025) and all of the next.
    expect(on(2025, "hanukkah")).toEqual([
      "2025-01-01", "2025-01-02",
      "2025-12-15", "2025-12-16", "2025-12-17", "2025-12-18", "2025-12-19", "2025-12-20", "2025-12-21", "2025-12-22",
    ]);
    expect(on(2026, "hanukkah").filter((d) => d >= "2026-12")[0]).toBe("2026-12-05");
  });

  it("Purim, Shushan Purim and the Fast of Esther — in a leap year, in Adar II", () => {
    expect(on(2025, "purim")).toEqual(["2025-03-14"]);
    expect(on(2025, "shushanPurim")).toEqual(["2025-03-15"]);
    expect(on(2024, "purim")).toEqual(["2024-03-24"]); // 5784 is a leap year
    expect(on(2024, "taanitEsther")).toEqual(["2024-03-21"]); // 13 Adar II on Shabbat → Thursday
    expect(on(2026, "purim")).toEqual(["2026-03-03"]);
  });

  it("Yom HaShoah moves off the days beside Shabbat", () => {
    expect(on(2025, "yomHashoah")).toEqual(["2025-04-24"]);
    expect(on(2024, "yomHashoah")).toEqual(["2024-05-06"]); // 27 Nisan on Sunday → Monday
    expect(on(2026, "yomHashoah")).toEqual(["2026-04-14"]);
  });

  it("fasts that fall on Shabbat move to Sunday", () => {
    expect(on(2025, "tishaBeAv")).toEqual(["2025-08-03"]);
    expect(on(2025, "shivaAsarBeTammuz")).toEqual(["2025-07-13"]);
    expect(on(2025, "tzomGedalia")).toEqual(["2025-09-25"]);
  });

  it("the rest of the year", () => {
    expect(on(2025, "tuBishvat")).toEqual(["2025-02-13"]);
    expect(on(2025, "lagBaomer")).toEqual(["2025-05-16"]);
    expect(on(2025, "yomYerushalayim")).toEqual(["2025-05-26"]);
    expect(on(2025, "tuBeAv")).toEqual(["2025-08-09"]);
    expect(on(2025, "sigd")).toEqual(["2025-11-20"]);
    expect(on(2025, "asaraBeTevet")).toEqual(["2025-01-10", "2025-12-30"]);
  });

  it("Rosh Chodesh: the 1st of each month, and the 30th before it when the month has thirty days", () => {
    const rc = on(2025, "roshChodesh");
    expect(rc).toContain("2025-03-30"); // 1 Nisan
    expect(rc).toContain("2025-02-28"); // 30 Shvat
    expect(rc).toContain("2025-03-01"); // 1 Adar
    expect(rc).not.toContain("2025-03-29"); // Adar has 29 days
    expect(rc).not.toContain("2025-09-23"); // 1 Tishrei is Rosh Hashana, not Rosh Chodesh
  });

  it("Rosh Chodesh Tevet is shown as Hanukkah, which it falls inside", () => {
    const day = israeliHolidays(2025).find((h) => h.date === "2025-12-22");
    expect(day?.key).toBe("hanukkah");
  });

  it("never closes anything, whatever the closing settings", () => {
    const closed = blockedDates({ blockHolidays: true, blockHolidayEves: true, blockCholHamoed: true }, [2025]);
    for (const h of israeliHolidays(2025).filter((x) => x.kind === "observance")) expect(closed.has(h.date)).toBe(false);
  });
});
