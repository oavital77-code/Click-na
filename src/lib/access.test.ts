import { describe, expect, it } from "vitest";
import { accessState, acceptsNewBookings, canWrite, daysLeft, graceEndFor, trialEndFor } from "./access";

const now = new Date("2026-09-10T10:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);
const base = { trialEndsAt: null, currentPeriodEnd: null, graceEndsAt: null, cancelAtPeriodEnd: false };

describe("accessState", () => {
  it("counts the trial down", () => {
    const s = accessState({ ...base, status: "trialing", trialEndsAt: days(12) }, now);
    expect(s).toMatchObject({ kind: "trialing", daysLeft: 12 });
    expect(canWrite(s)).toBe(true);
  });

  it("gives seven days of grace after the trial, then locks", () => {
    const trialEndsAt = days(-1);
    const inGrace = accessState({ ...base, status: "trialing", trialEndsAt }, now);
    expect(inGrace).toMatchObject({ kind: "grace", reason: "trial_ended", daysLeft: 6 });
    expect(canWrite(inGrace)).toBe(true);

    const locked = accessState({ ...base, status: "trialing", trialEndsAt: days(-8) }, now);
    expect(locked).toEqual({ kind: "locked", reason: "trial_ended" });
    expect(canWrite(locked)).toBe(false);
  });

  it("honours a stored grace deadline over the computed one", () => {
    const s = accessState({ ...base, status: "trialing", trialEndsAt: days(-20), graceEndsAt: days(2) }, now);
    expect(s).toMatchObject({ kind: "grace", daysLeft: 2 });
  });

  it("is active while paid, canceling once cancellation is scheduled", () => {
    expect(accessState({ ...base, status: "active", currentPeriodEnd: days(20) }, now)).toEqual({
      kind: "active",
      periodEnd: days(20),
    });
    const canceling = accessState(
      { ...base, status: "active", currentPeriodEnd: days(20), cancelAtPeriodEnd: true },
      now
    );
    expect(canceling).toEqual({ kind: "canceling", periodEnd: days(20) });
    expect(canWrite(canceling)).toBe(true);
  });

  it("gives grace after a failed renewal, then locks", () => {
    const g = accessState({ ...base, status: "past_due", currentPeriodEnd: days(-2) }, now);
    expect(g).toMatchObject({ kind: "grace", reason: "payment_failed", daysLeft: 5 });
    const l = accessState({ ...base, status: "past_due", currentPeriodEnd: days(-9) }, now);
    expect(l).toEqual({ kind: "locked", reason: "payment_failed" });
  });

  it("keeps a cancelled subscription working until the paid period ends", () => {
    expect(accessState({ ...base, status: "canceled", currentPeriodEnd: days(3) }, now)).toEqual({
      kind: "canceling",
      periodEnd: days(3),
    });
    expect(accessState({ ...base, status: "canceled", currentPeriodEnd: days(-1) }, now)).toEqual({
      kind: "locked",
      reason: "canceled",
    });
  });

  it("locks an unpaid subscription", () => {
    expect(accessState({ ...base, status: "unpaid" }, now)).toEqual({ kind: "locked", reason: "payment_failed" });
  });
});

describe("what clients see", () => {
  it("keeps taking bookings through a lapsed trial or a failed card, but not after a cancellation", () => {
    expect(acceptsNewBookings({ kind: "locked", reason: "trial_ended" })).toBe(true);
    expect(acceptsNewBookings({ kind: "locked", reason: "payment_failed" })).toBe(true);
    expect(acceptsNewBookings({ kind: "locked", reason: "canceled" })).toBe(false);
    expect(acceptsNewBookings({ kind: "trialing", daysLeft: 3, trialEndsAt: days(3) })).toBe(true);
  });
});

describe("dates", () => {
  it("measures days left in whole days, never negative", () => {
    expect(daysLeft(days(2.4), now)).toBe(3);
    expect(daysLeft(days(-1), now)).toBe(0);
  });
  it("derives the trial and grace ends from the plan constants", () => {
    expect(trialEndFor(now)).toEqual(days(30));
    expect(graceEndFor(now)).toEqual(days(7));
  });
});
