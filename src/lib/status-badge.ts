import { cn } from "@/lib/utils";

// Nocturne §06: status is never color-only — the dot plus a bordered, tinted
// chip carries the meaning, so the four/five tones stay distinguishable
// without relying on hue alone.
export type StatusTone = "open" | "booked" | "held" | "blocked" | "danger" | "neutral";

const TONE_CLASSES: Record<StatusTone, string> = {
  open: "bg-st-open/15 text-st-open border-st-open/30",
  booked: "bg-st-booked/12 text-st-booked border-st-booked/40 font-bold",
  held: "bg-st-held/15 text-st-held border-st-held/30 font-bold",
  blocked: "bg-st-blocked/20 text-neutral-300 border-st-blocked/40",
  danger: "bg-st-danger/15 text-st-danger border-st-danger/30",
  neutral: "bg-neutral-800 text-neutral-300 border-neutral-700",
};

export function statusBadgeClass(tone: StatusTone) {
  return cn(
    "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium",
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
