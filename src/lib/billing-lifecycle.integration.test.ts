import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { handleUserCreated } from "@/lib/webhooks";
import { runBillingLifecycle } from "@/lib/billing-lifecycle";
import { applyVerifiedTransaction } from "@/lib/billing";

const created: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  if (created.length === 0) return;
  const therapists = await prisma.therapist.findMany({ where: { clerkUserId: { in: created } } });
  const ids = therapists.map((t) => t.id);
  await prisma.notification.deleteMany({ where: { therapistId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { therapistId: { in: ids } } });
  await prisma.therapistSettings.deleteMany({ where: { therapistId: { in: ids } } });
  await prisma.subscription.deleteMany({ where: { therapistId: { in: ids } } });
  await prisma.therapist.deleteMany({ where: { id: { in: ids } } });
  created.length = 0;
});

const DAY = 86_400_000;

/** A therapist whose trial started `daysAgo` days before `now`. */
async function trialStarted(daysAgo: number, now: Date) {
  const id = `lifecycle_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  created.push(id);
  const therapistId = (await handleUserCreated({
    id,
    email_addresses: [{ id: "e", email_address: `${id}@example.com`, verification: { status: "verified" } }],
    primary_email_address_id: "e",
    first_name: "Trial",
    last_name: null,
  }))!;
  await prisma.subscription.update({
    where: { therapistId },
    data: { trialEndsAt: new Date(now.getTime() + (30 - daysAgo) * DAY) },
  });
  return therapistId;
}

async function mailCount(therapistId: string) {
  return prisma.notification.count({ where: { therapistId, type: "trial_reminder" } });
}

describe("runBillingLifecycle (against a live database)", () => {
  const now = new Date("2026-09-10T06:00:00Z");

  it("sends nothing in the first three weeks", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const id = await trialStarted(10, now);
    const s = await runBillingLifecycle(now);
    expect(await mailCount(id)).toBe(0);
    expect(s.reminders).toBe(0);
  });

  it("sends the day-23 reminder once, then the day-28, then the last-day one", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const id = await trialStarted(22, now); // day 23 of the trial

    await runBillingLifecycle(now);
    await runBillingLifecycle(now); // same day again: idempotent
    expect(await mailCount(id)).toBe(1);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } })).lastTrialReminderDay).toBe(23);

    await runBillingLifecycle(new Date(now.getTime() + 5 * DAY)); // day 28
    expect(await mailCount(id)).toBe(2);

    await runBillingLifecycle(new Date(now.getTime() + 7 * DAY)); // day 30, the last day
    expect(await mailCount(id)).toBe(3);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } })).lastTrialReminderDay).toBe(30);
  });

  it("skips straight to the latest due reminder if the cron missed days", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const id = await trialStarted(27, now); // day 28, and day 23 was never sent
    await runBillingLifecycle(now);
    expect(await mailCount(id)).toBe(1);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } })).lastTrialReminderDay).toBe(28);
  });

  it("ends the trial into seven days of grace, then locks", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const id = await trialStarted(31, now); // ended yesterday
    const s1 = await runBillingLifecycle(now);
    expect(s1.ended).toBe(1);
    let sub = await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } });
    expect(sub.status).toBe("past_due");
    expect(sub.graceEndsAt).toEqual(new Date(sub.trialEndsAt!.getTime() + 7 * DAY));

    // Grace still running: nothing more happens.
    const s2 = await runBillingLifecycle(new Date(now.getTime() + 3 * DAY));
    expect(s2.locked).toBe(0);

    // Grace over: locked, and told.
    const s3 = await runBillingLifecycle(new Date(now.getTime() + 7 * DAY));
    expect(s3.locked).toBe(1);
    sub = await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } });
    expect(sub.status).toBe("unpaid");
    expect(await mailCount(id)).toBe(2); // ended + locked
  });

  it("turns a paid period that ended without a renewal into grace, and a late callback heals it", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("PLAN_PRICE_ILS", "89.90");
    const id = await trialStarted(60, now);
    const periodEnd = new Date(now.getTime() - 3 * DAY);
    await prisma.subscription.update({
      where: { therapistId: id },
      data: { status: "active", tier: "plus", currentPeriodStart: new Date(periodEnd.getTime() - 30 * DAY), currentPeriodEnd: periodEnd, payplusTokenUid: null },
    });

    const s = await runBillingLifecycle(now);
    expect(s.unconfirmed).toBe(1);
    let sub = await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } });
    expect(sub.status).toBe("past_due");
    expect(sub.graceEndsAt).toEqual(new Date(periodEnd.getTime() + 7 * DAY));
    expect(await prisma.notification.count({ where: { therapistId: id, type: "subscription" } })).toBe(1);

    // Running again does not double up.
    expect((await runBillingLifecycle(now)).unconfirmed).toBe(0);

    // The renewal callback arrives late: active again, grace gone.
    await applyVerifiedTransaction(
      { transactionUid: "tx_late", pageRequestUid: null, statusCode: "000", amount: 89.9, moreInfo: null, tokenUid: null, customerUid: null, terminalUid: null, cashierUid: null },
      {},
      now,
      { therapistId: id }
    );
    sub = await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } });
    expect(sub.status).toBe("active");
    expect(sub.graceEndsAt).toBeNull();
    expect(sub.currentPeriodEnd!.getTime()).toBeGreaterThan(now.getTime());
  });

  it("gives a renewal two days to confirm before acting", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const id = await trialStarted(60, now);
    await prisma.subscription.update({
      where: { therapistId: id },
      data: { status: "active", tier: "plus", currentPeriodEnd: new Date(now.getTime() - 1 * DAY) },
    });
    expect((await runBillingLifecycle(now)).unconfirmed).toBe(0);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { therapistId: id } })).status).toBe("active");
  });

  it("leaves paying customers alone", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const id = await trialStarted(40, now);
    await prisma.subscription.update({
      where: { therapistId: id },
      data: { status: "active", tier: "plus", currentPeriodEnd: new Date(now.getTime() + 20 * DAY) },
    });
    const s = await runBillingLifecycle(now);
    expect(s).toEqual({ reminders: 0, ended: 0, locked: 0, unconfirmed: 0, renewals: { charged: 0, declined: 0, errors: 0, noToken: 0 } });
    expect(await mailCount(id)).toBe(0);
  });
});
