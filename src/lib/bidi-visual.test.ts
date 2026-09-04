import { describe, expect, it } from "vitest";
import { toVisualOrder } from "@/lib/bidi-visual";

describe("toVisualOrder", () => {
  it("reverses a pure Hebrew run", () => {
    expect(toVisualOrder("שלום")).toBe("םולש");
  });

  it("round-trips: reordering twice returns the original", () => {
    const text = "היומן שלך";
    expect(toVisualOrder(toVisualOrder(text))).toBe(text);
  });

  // The case a plain string reverse gets wrong: the digits must stay ascending
  // while the Hebrew around them runs the other way.
  it("keeps digits readable inside a Hebrew line", () => {
    const visual = toVisualOrder("50 דקות");
    expect(visual).toContain("50");
    expect(visual).not.toContain("05");
  });

  it("keeps a Latin word readable inside a Hebrew line", () => {
    expect(toVisualOrder("פגישת Zoom היום")).toContain("Zoom");
  });

  it("places a trailing Hebrew comma at the visual left", () => {
    // In logical order the comma follows "שלך"; visually it must end up leftmost.
    expect(toVisualOrder("שלך, בלי").startsWith("ילב ,")).toBe(true);
  });

  it("mirrors brackets so they still enclose the phrase", () => {
    const visual = toVisualOrder("(שלום)");
    expect(visual.startsWith("(")).toBe(true);
    expect(visual.endsWith(")")).toBe(true);
  });

  it("leaves a pure Latin string untouched under an LTR base", () => {
    expect(toVisualOrder("Cleana+", "ltr")).toBe("Cleana+");
  });

  it("handles empty and single-character input", () => {
    expect(toVisualOrder("")).toBe("");
    expect(toVisualOrder("א")).toBe("א");
  });

  // Reversing by code unit would leave the pair back to front and render a box.
  it("keeps a surrogate pair intact through the reversal", () => {
    const visual = toVisualOrder("שלום 🌿 עולם");
    expect(visual).toContain("🌿");
    expect(visual).not.toContain("\ufffd");
  });
});
