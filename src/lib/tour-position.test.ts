import { describe, expect, it } from "vitest";
import { placeCard } from "@/lib/tour-position";

const card = { width: 352, height: 200 };
const phone = { width: 390, height: 844 };
const desktop = { width: 1440, height: 900 };

describe("placeCard", () => {
  it("centres a card with no element to point at", () => {
    const p = placeCard(null, card, desktop);
    expect(p.placement).toBe("center");
    expect(p.left).toBe((1440 - 352) / 2);
    expect(p.top).toBe((900 - 200) / 2);
  });

  it("goes below an element near the top, kept inside the screen", () => {
    const p = placeCard({ top: 40, left: 20, width: 100, height: 40 }, card, phone);
    expect(p.placement).toBe("bottom");
    expect(p.top).toBe(40 + 40 + 12);
    expect(p.left).toBeGreaterThanOrEqual(12);
    expect(p.left + card.width).toBeLessThanOrEqual(phone.width - 12);
  });

  it("goes above an element at the bottom, like the phone's tab bar", () => {
    const p = placeCard({ top: 770, left: 20, width: 70, height: 56 }, card, phone);
    expect(p.placement).toBe("top");
    expect(p.top + card.height).toBeLessThanOrEqual(770 - 12);
  });

  it("goes beside a menu item on the desktop rail, not on top of the items under it", () => {
    // The rail is on the right in Hebrew: its item has room to its left.
    const item = { top: 120, left: 1230, width: 190, height: 44 };
    const p = placeCard(item, card, desktop, "side");
    expect(p.placement).toBe("start");
    expect(p.left + card.width).toBeLessThanOrEqual(item.left - 12);
  });

  it("rests at the bottom edge when the element is taller than the screen", () => {
    const p = placeCard({ top: 0, left: 20, width: 350, height: 2000 }, card, phone);
    expect(p.placement).toBe("fallback");
    expect(p.top + card.height).toBeLessThanOrEqual(phone.height - 12);
  });

  it("never leaves the screen, whatever the element's position", () => {
    for (const top of [-50, 0, 300, 800, 1000]) {
      for (const left of [-50, 0, 200, 380]) {
        const p = placeCard({ top, left, width: 60, height: 40 }, card, phone);
        expect(p.left).toBeGreaterThanOrEqual(12);
        expect(p.left + card.width).toBeLessThanOrEqual(phone.width - 12);
        expect(p.top).toBeGreaterThanOrEqual(12);
      }
    }
  });
});
