import { describe, expect, it } from "vitest";
import { dragTo, firstFreeStart, place, proposeStart, resizeTo, visibleRange } from "@/lib/time-grid";

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

describe("dragging a new slot", () => {
  it("lands on the nearest half hour from where it was dragged", () => {
    // From 13:30, 40 minutes down: 14:10 rounds to 14:00; 50 minutes down rounds to 14:30.
    expect(dragTo(day, h(13, 30), 40, 50, h(8), h(18)).start).toBe(h(14));
    expect(dragTo(day, h(13, 30), 50, 50, h(8), h(18)).start).toBe(h(14, 30));
    expect(dragTo(day, h(13, 30), -20, 50, h(8), h(18)).start).toBe(h(13));
  });

  it("stays inside the visible day", () => {
    expect(dragTo(day, h(9), -600, 50, h(8), h(18)).start).toBe(h(8));
    expect(dragTo(day, h(9), 900, 50, h(8), h(18)).start).toBe(h(17));
  });

  it("says when it is dragged onto something already there", () => {
    expect(dragTo(day, h(13), -60, 50, h(8), h(18))).toEqual({ start: h(12), fits: false });
    expect(dragTo(day, h(13), 60, 50, h(8), h(18))).toEqual({ start: h(14), fits: true });
  });
});

describe("stretching or shrinking a new slot by an edge", () => {
  const span = { start: h(14), end: h(15) };

  it("moves only the edge held, to the nearest half hour", () => {
    expect(resizeTo(day, span, "end", 40, h(8), h(18))).toEqual({ start: h(14), end: h(15, 30), fits: true });
    expect(resizeTo(day, span, "start", -50, h(8), h(18))).toEqual({ start: h(13), end: h(15), fits: true });
    expect(resizeTo(day, span, "end", -20, h(8), h(18))).toEqual({ start: h(14), end: h(14, 30), fits: true });
  });

  it("never gets shorter than half an hour, nor leaves the day", () => {
    expect(resizeTo(day, span, "end", -300, h(8), h(18))).toMatchObject({ start: h(14), end: h(14, 30) });
    expect(resizeTo(day, span, "start", 300, h(8), h(18))).toMatchObject({ start: h(14, 30), end: h(15) });
    expect(resizeTo(day, span, "end", 600, h(8), h(18))).toMatchObject({ end: h(18) });
  });

  it("says when it is stretched over something already there", () => {
    // Up to 12:30 runs into the 12:00–13:00 lunch.
    expect(resizeTo(day, span, "start", -90, h(8), h(18))).toEqual({ start: h(12, 30), end: h(15), fits: false });
  });
});
