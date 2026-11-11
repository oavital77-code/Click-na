/**
 * The guided tour, as data. Each step names the element it points at (a
 * `data-tour="…"` attribute on the page) and its id doubles as the key of its
 * text in messages.tour.steps. A step with no target is a centred card.
 *
 * Which steps run depends on the device and the page (tourSteps), so the
 * "step 3 of 17" the person sees is true.
 */
export type TourStepId =
  | "welcome"
  | "navDashboard"
  | "navAvailability"
  | "navBookings"
  | "navClients"
  | "navMore"
  | "navLink"
  | "navAddons"
  | "navMessages"
  | "navBilling"
  | "navSettings"
  | "homeCopy"
  | "homeOpenHour"
  | "user"
  | "firstSteps"
  | "next"
  | "today"
  | "unpaid"
  | "week"
  | "calendar"
  | "end";

export type TourStepDef = {
  id: TourStepId;
  /** The `data-tour` value of the element to light up; null for a centred card. */
  target: string | null;
  /** Phones show the first four places in a bar and the rest in a drawer: this step needs the drawer open. */
  menu?: boolean;
  only?: "mobile" | "desktop";
  /** The lead card on the home screen is the first-steps list until the first booking, the next session after. */
  needs?: "firstSteps" | "noFirstSteps";
};

export const TOUR_STEPS: readonly TourStepDef[] = [
  { id: "welcome", target: null },
  { id: "navDashboard", target: "nav-dashboard" },
  { id: "navAvailability", target: "nav-availability" },
  { id: "navBookings", target: "nav-bookings" },
  { id: "navClients", target: "nav-clients" },
  { id: "navMore", target: "nav-more", only: "mobile" },
  { id: "navLink", target: "nav-link", menu: true },
  { id: "navAddons", target: "nav-addons", menu: true },
  { id: "navMessages", target: "nav-messages", menu: true },
  { id: "navBilling", target: "nav-billing", menu: true },
  { id: "navSettings", target: "nav-settings", menu: true },
  { id: "homeCopy", target: "home-copy" },
  { id: "homeOpenHour", target: "home-open-hour" },
  { id: "user", target: "user" },
  { id: "firstSteps", target: "home-first-steps", needs: "firstSteps" },
  { id: "next", target: "home-next", needs: "noFirstSteps" },
  { id: "today", target: "home-today" },
  { id: "unpaid", target: "home-unpaid" },
  { id: "week", target: "home-week" },
  { id: "calendar", target: "home-calendar" },
  { id: "end", target: null },
];

export function tourSteps(context: { mobile: boolean; firstSteps: boolean }): TourStepDef[] {
  const steps = TOUR_STEPS.filter((step) => {
    if (step.only === "mobile" && !context.mobile) return false;
    if (step.only === "desktop" && context.mobile) return false;
    if (step.needs === "firstSteps" && !context.firstSteps) return false;
    if (step.needs === "noFirstSteps" && context.firstSteps) return false;
    return true;
  });
  // On a phone the schedule comes straight after today (the page stacks it there), so the tour
  // follows the page down instead of jumping back up to what is owed and the week.
  if (context.mobile) {
    const calendar = steps.findIndex((s) => s.id === "calendar");
    const [step] = steps.splice(calendar, 1);
    steps.splice(steps.findIndex((s) => s.id === "today") + 1, 0, step);
  }
  return steps;
}
