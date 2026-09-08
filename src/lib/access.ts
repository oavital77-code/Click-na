import { GRACE_DAYS, TRIAL_DAYS } from "@/lib/plan";

/**
 * What a subscription's row means for the person behind it, right now.
 *
 * One function decides this so the dashboard banner, the lock, the API's 402
 * and the cron all agree. The public booking page, the manage links and the
 * reminders are deliberately not consulted here: a client's appointment never
 * depends on whether the therapist has paid.
 */
export type SubscriptionLike = {
  status: "trialing" | "active" | "past_due" | "canceled" | "unpaid";
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
};

export type AccessState =
  | { kind: "trialing"; daysLeft: number; trialEndsAt: Date }
  | { kind: "active"; periodEnd: Date | null }
  | { kind: "canceling"; periodEnd: Date }
  | { kind: "grace"; daysLeft: number; graceEndsAt: Date; reason: "trial_ended" | "payment_failed" }
  | { kind: "locked"; reason: "trial_ended" | "payment_failed" | "canceled" };

const DAY = 24 * 60 * 60 * 1000;

/** Whole days from now until `until`, never negative; today counts as 1 while it lasts. */
export function daysLeft(until: Date, now: Date): number {
  return Math.max(0, Math.ceil((until.getTime() - now.getTime()) / DAY));
}

export function trialEndFor(createdAt: Date): Date {
  return new Date(createdAt.getTime() + TRIAL_DAYS * DAY);
}

export function graceEndFor(from: Date): Date {
  return new Date(from.getTime() + GRACE_DAYS * DAY);
}

export function accessState(sub: SubscriptionLike, now: Date = new Date()): AccessState {
  switch (sub.status) {
    case "trialing": {
      if (sub.trialEndsAt && sub.trialEndsAt > now) {
        return { kind: "trialing", daysLeft: daysLeft(sub.trialEndsAt, now), trialEndsAt: sub.trialEndsAt };
      }
      // The trial is over and the cron has not moved the row yet (it runs once a
      // day): behave as the cron will, so nobody is locked out or let in early.
      const graceEndsAt = sub.graceEndsAt ?? (sub.trialEndsAt ? graceEndFor(sub.trialEndsAt) : null);
      if (graceEndsAt && graceEndsAt > now) {
        return { kind: "grace", daysLeft: daysLeft(graceEndsAt, now), graceEndsAt, reason: "trial_ended" };
      }
      return { kind: "locked", reason: "trial_ended" };
    }
    case "active": {
      if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
        return sub.currentPeriodEnd > now
          ? { kind: "canceling", periodEnd: sub.currentPeriodEnd }
          : { kind: "locked", reason: "canceled" };
      }
      return { kind: "active", periodEnd: sub.currentPeriodEnd };
    }
    case "past_due": {
      const graceEndsAt = sub.graceEndsAt ?? (sub.currentPeriodEnd ? graceEndFor(sub.currentPeriodEnd) : null);
      if (graceEndsAt && graceEndsAt > now) {
        return { kind: "grace", daysLeft: daysLeft(graceEndsAt, now), graceEndsAt, reason: "payment_failed" };
      }
      return { kind: "locked", reason: "payment_failed" };
    }
    case "canceled": {
      if (sub.currentPeriodEnd && sub.currentPeriodEnd > now) {
        return { kind: "canceling", periodEnd: sub.currentPeriodEnd };
      }
      return { kind: "locked", reason: "canceled" };
    }
    case "unpaid":
      return { kind: "locked", reason: "payment_failed" };
  }
}

/** Whether the therapist may change things. Reading is always allowed. */
export function canWrite(state: AccessState): boolean {
  return state.kind !== "locked";
}

/** Whether the public page should still take new bookings for this therapist. */
export function acceptsNewBookings(state: AccessState): boolean {
  // Everything but a lock caused by cancellation: a lapsed trial or a failed
  // card is the therapist's problem to fix, and their clients keep booking
  // meanwhile; a cancelled practice has said it is closing.
  return !(state.kind === "locked" && state.reason === "canceled");
}
