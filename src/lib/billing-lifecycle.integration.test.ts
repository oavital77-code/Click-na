import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { handleUserCreated } from "@/lib/webhooks";
import { runBillingLifecycle } from "@/lib/billing-lifecycle";

const created: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  if (created.length === 0) return;
  const therapists = await prisma.therapist.findMany({ where: { clerkUserId: { in: created } } });
  const ids = therapists.map((t) => t.id);
  await prisma.notification.deleteMany({ where: { therapistId: { in: ids } } });
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

  it("leaves paying customers alone", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const id = await trialStarted(40, now);
    await prisma.subscription.update({
      where: { therapistId: id },
      data: { status: "active", tier: "plus", currentPeriodEnd: new Date(now.getTime() + 20 * DAY) },
    });
    const s = await runBillingLifecycle(now);
    expect(s).toEqual({ reminders: 0, ended: 0, locked: 0 });
    expect(await mailCount(id)).toBe(0);
  });
});
