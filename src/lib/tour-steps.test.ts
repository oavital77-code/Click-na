import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getMessages } from "@/i18n";
import { TOUR_STEPS, tourSteps } from "@/lib/tour-steps";

function sources(dir: string): string {
  return readdirSync(dir)
    .map((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? sources(path) : /\.tsx$/.test(name) ? readFileSync(path, "utf8") : "";
    })
    .join("\n");
}
const dashboard = sources(join(process.cwd(), "src/app/(app)/dashboard"));

describe("the guided tour's steps", () => {
  it("opens and closes with a card that points at nothing", () => {
    expect(TOUR_STEPS[0].target).toBeNull();
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].target).toBeNull();
  });

  it("every step has its text, in both languages", () => {
    for (const locale of ["he", "en"] as const) {
      const steps = getMessages(locale).tour.steps;
      for (const { id } of TOUR_STEPS) {
        expect(steps[id]?.title, `${locale} ${id}`).toBeTruthy();
        expect(steps[id]?.body, `${locale} ${id}`).toBeTruthy();
      }
    }
  });

  it("every element a step points at carries its data-tour on the page", () => {
    const home = TOUR_STEPS.filter((s) => s.target && !s.target.startsWith("nav-")).map((s) => s.target!);
    for (const target of home) expect(dashboard, target).toContain(`data-tour="${target}"`);
    // The menu items get theirs from their key, on the desktop rail, the phone's bar and its drawer.
    expect(dashboard).toContain("data-tour={`nav-${link.key}`}");
    expect(dashboard).toContain("data-tour={`nav-${tab.key}`}");
    expect(dashboard).toContain('data-tour="nav-more"');
  });

  it("the phone gets the 'more' step and opens the drawer for what is in it; the desktop does not", () => {
    const phone = tourSteps({ mobile: true, firstSteps: false });
    const desk = tourSteps({ mobile: false, firstSteps: false });
    expect(phone.map((s) => s.id)).toContain("navMore");
    expect(desk.map((s) => s.id)).not.toContain("navMore");
    expect(phone.filter((s) => s.menu).map((s) => s.id)).toEqual(["navLink", "navAddons", "navMessages", "navBilling", "navSettings"]);
  });

  it("points at the first-steps list until the first booking, and at the next session after", () => {
    const before = tourSteps({ mobile: false, firstSteps: true }).map((s) => s.id);
    const after = tourSteps({ mobile: false, firstSteps: false }).map((s) => s.id);
    expect(before).toContain("firstSteps");
    expect(before).not.toContain("next");
    expect(after).toContain("next");
    expect(after).not.toContain("firstSteps");
  });

  it("covers every item of the menu", () => {
    const ids = tourSteps({ mobile: true, firstSteps: false }).map((s) => s.target);
    for (const key of ["dashboard", "availability", "bookings", "clients", "link", "addons", "messages", "billing", "settings"]) {
      expect(ids).toContain(`nav-${key}`);
    }
  });
});
