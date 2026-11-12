import { describe, expect, it } from "vitest";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { splitIntoSlots } from "@/lib/cleana-slots";

const TZ = "Asia/Jerusalem";
const at = (local: string) => fromZonedTime(local, TZ);
const times = (slots: { startsAt: Date; endsAt: Date }[]) =>
  slots.map((s) => `${formatInTimeZone(s.startsAt, TZ, "HH:mm")}-${formatInTimeZone(s.endsAt, TZ, "HH:mm")}`);

describe("splitIntoSlots — the table in the spec", () => {
  it("14:00–17:00, 60 + 0", () => {
    expect(times(splitIntoSlots(at("2026-11-17 14:00"), at("2026-11-17 17:00"), 60, 0))).toEqual([
      "14:00-15:00",
      "15:00-16:00",
      "16:00-17:00",
    ]);
  });

  it("14:00–17:00, 50 + 10", () => {
    expect(times(splitIntoSlots(at("2026-11-17 14:00"), at("2026-11-17 17:00"), 50, 10))).toEqual([
      "14:00-14:50",
      "15:00-15:50",
      "16:00-16:50",
    ]);
  });

  it("14:00–17:00, 45 + 15", () => {
    expect(times(splitIntoSlots(at("2026-11-17 14:00"), at("2026-11-17 17:00"), 45, 15))).toEqual([
      "14:00-14:45",
      "15:00-15:45",
      "16:00-16:45",
    ]);
  });

  it("09:00–10:30, 60 + 0: the half hour left is too short", () => {
    expect(times(splitIntoSlots(at("2026-11-17 09:00"), at("2026-11-17 10:30"), 60, 0))).toEqual(["09:00-10:00"]);
  });

  it("a room shorter than one treatment opens nothing", () => {
    expect(splitIntoSlots(at("2026-11-17 09:00"), at("2026-11-17 09:30"), 50, 10)).toEqual([]);
  });

  it("the last slot may end exactly at the room's end without its break", () => {
    expect(times(splitIntoSlots(at("2026-11-17 09:00"), at("2026-11-17 10:50"), 50, 10))).toEqual([
      "09:00-09:50",
      "10:00-10:50",
    ]);
  });
});

describe("splitIntoSlots — across the clock change", () => {
  // Israel moves to winter time on the last Sunday of October (2026-10-25 02:00 → 01:00)
  // and to summer time on the Friday before the last Sunday of March (2027-03-26 02:00 → 03:00).
  it("keeps real lengths through the autumn change", () => {
    const slots = splitIntoSlots(at("2026-10-25 00:00"), at("2026-10-25 03:00"), 60, 0);
    // Three wall-clock hours hold four real ones that night.
    expect(slots).toHaveLength(4);
    for (const s of slots) expect(s.endsAt.getTime() - s.startsAt.getTime()).toBe(60 * 60_000);
  });

  it("keeps real lengths through the spring change", () => {
    const slots = splitIntoSlots(at("2027-03-26 01:00"), at("2027-03-26 04:00"), 60, 0);
    // Three wall-clock hours hold two real ones that night.
    expect(slots).toHaveLength(2);
    expect(times(slots)).toEqual(["01:00-03:00", "03:00-04:00"]);
  });
});
