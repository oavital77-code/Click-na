import { describe, expect, it } from "vitest";
import { buildTimeAxis, SCHEDULE_END_HOUR, SCHEDULE_START_HOUR } from "@/lib/schedule-grid";

describe("buildTimeAxis", () => {
  it("spans the full working day at the therapist's slot length", () => {
    const axis = buildTimeAxis(45, []);
    expect(axis[0]).toBe("07:00");
    expect(axis[1]).toBe("07:45");
    expect(axis.at(-1)).toBe("22:00");
  });

  it("covers 07:00–22:00 inclusive for a step that divides the range evenly", () => {
    const axis = buildTimeAxis(60, []);
    expect(axis).toHaveLength(SCHEDULE_END_HOUR - SCHEDULE_START_HOUR + 1);
    expect(axis[0]).toBe("07:00");
    expect(axis.at(-1)).toBe("22:00");
  });

  it("never runs past 22:00 when the step doesn't divide the range evenly", () => {
    const axis = buildTimeAxis(50, []);
    expect(axis.every((t) => t <= "22:00")).toBe(true);
  });

  // The grid is keyed by exact "HH:mm", so a session on an off-grid time would
  // disappear entirely if the axis didn't carry a row for it.
  it("keeps a session whose time is off the fixed grid", () => {
    const axis = buildTimeAxis(60, ["09:45"]);
    expect(axis).toContain("09:45");
    expect(axis.indexOf("09:45")).toBe(axis.indexOf("09:00") + 1);
  });

  it("keeps sessions scheduled outside working hours", () => {
    const axis = buildTimeAxis(60, ["06:15", "23:30"]);
    expect(axis[0]).toBe("06:15");
    expect(axis.at(-1)).toBe("23:30");
  });

  it("sorts chronologically rather than lexicographically", () => {
    const axis = buildTimeAxis(60, ["09:05"]);
    const asMinutes = axis.map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));
    expect([...asMinutes].sort((a, b) => a - b)).toEqual(asMinutes);
  });

  it("does not duplicate a session time that already sits on the grid", () => {
    const axis = buildTimeAxis(60, ["09:00", "09:00"]);
    expect(axis.filter((t) => t === "09:00")).toHaveLength(1);
  });

  it("falls back to hourly rows rather than hanging on a non-positive step", () => {
    const axis = buildTimeAxis(0, []);
    expect(axis).toHaveLength(SCHEDULE_END_HOUR - SCHEDULE_START_HOUR + 1);
  });
});
