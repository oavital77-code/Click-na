import { cn } from "@/lib/utils";

// Status is never carried by colour alone — the tint, the border and the label
// each carry it, so the states stay distinguishable without relying on hue.
export type StatusTone = "open" | "booked" | "held" | "blocked" | "danger" | "neutral";

const TONE_CLASSES: Record<StatusTone, string> = {
  // Sage on a pale sage wash — open time reads as calm and available.
  open: "bg-st-open-bg/60 text-st-open border-st-open/35",
  // Terracotta on warm peach. This is the loudest chip in the system on purpose:
  // a booked slot has to be the first thing found when scanning the week.
  booked: "bg-st-booked-bg text-st-booked border-st-booked/45 font-bold",
  held: "bg-st-held-bg text-st-booked border-st-held font-bold",
  blocked: "bg-st-blocked-bg text-foreground/75 border-st-blocked/45 font-bold",
  danger: "bg-st-danger/12 text-st-danger border-st-danger/35",
  neutral: "bg-secondary text-muted-foreground border-border",
};

export function statusBadgeClass(tone: StatusTone) {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-full border px-2.5 py-0.5 text-center text-xs leading-tight font-medium",
    TONE_CLASSES[tone]
  );
}

const SESSION_TONE: Record<string, StatusTone> = {
  open: "open",
  held: "held",
  booked: "booked",
  blocked: "blocked",
  completed: "neutral",
  canceled: "neutral",
};

const BOOKING_TONE: Record<string, StatusTone> = {
  pending: "held",
  confirmed: "open",
  canceled_by_client: "danger",
  canceled_by_therapist: "danger",
  completed: "neutral",
  no_show: "neutral",
};

export function sessionStatusTone(status: string): StatusTone {
  return SESSION_TONE[status] ?? "neutral";
}

export function bookingStatusTone(status: string): StatusTone {
  return BOOKING_TONE[status] ?? "neutral";
}
