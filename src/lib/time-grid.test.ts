import { describe, expect, it } from "vitest";
import { firstFreeStart, place, proposeStart, visibleRange } from "@/lib/time-grid";

const h = (hh: number, mm = 0) => hh * 60 + mm;
// 45-minute sessions with a 10-minute break, as in the therapist's week.
const day = [
  { id: "a", start: h(9), end: h(9, 45) },
  { id: "b", start: h(9, 55), end: h(10, 40) },
  { id: "c", start: h(12), end: h(13) },
];

describe("a calendar drawn to scale", () => {
  it("shows a working day, widened to every session in view", () => {
    expect(visibleRange([])).toEqual({ startHour: 8, endHour: 18 });
    expect(visibleRange([{ start: h(7, 30), end: h(8, 15) }, { start: h(19), end: h(20, 10) }])).toEqual({ startHour: 7, endHour: 21 });
  });

  it("draws a session as long as it lasts", () => {
    // 09:55–10:40 on 64px hours: it covers the 10:00 line, which is the whole point.
    const { top, height } = place(h(9, 55), h(10, 40), 8, 64);
    expect(top).toBeCloseTo(((115) / 60) * 64);
    expect(height).toBeCloseTo(48);
    expect(top).toBeLessThan(2 * 64);
    expect(top + height).toBeGreaterThan(2 * 64);
  });
});

describe("where a tap on empty time opens a slot", () => {
  it("never lands inside a session: 10:00 is taken until 10:40 and its break", () => {
    expect(proposeStart(day, h(10, 45), 45, 10)).toEqual({ start: h(10, 50), fits: true });
  });

  it("snaps to the half hour on a free stretch", () => {
    expect(proposeStart(day, h(14, 22), 45, 10)).toEqual({ start: h(14, 0), fits: true });
    expect(proposeStart(day, h(14, 52), 60, 0)).toEqual({ start: h(14, 30), fits: true });
  });

  it("says when a whole session does not fit before the next one", () => {
    // 11:30 + 45 minutes runs into the 12:00 session.
    expect(proposeStart(day, h(11, 30), 45, 10).fits).toBe(false);
    expect(proposeStart(day, h(23, 30), 45, 0).fits).toBe(false);
  });

  it("finds the first free start for the keyboard", () => {
    expect(firstFreeStart(day, h(9), 45, 10)).toBe(h(10, 50));
    expect(firstFreeStart([{ id: "x", start: 0, end: 24 * 60 }], 0, 45, 0)).toBeNull();
  });
});
