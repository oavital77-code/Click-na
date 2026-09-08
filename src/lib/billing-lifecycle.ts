import { prisma } from "@/lib/prisma";
import { graceEndFor } from "@/lib/access";
import { GRACE_DAYS, TRIAL_DAYS, TRIAL_REMINDER_DAYS } from "@/lib/plan";
import { sendTrialEmail } from "@/lib/account-emails";

/**
 * The daily pass over every subscription that is not simply "paid and fine".
 *
 * Runs from the cron, once a day, and is safe to run twice: every step checks
 * the row's state before acting and records what it did on the row itself.
 *
 *  - Trial countdown mail on days 23, 28 and 30 of the trial — each once.
 *  - A trial that has ended becomes past_due with a grace deadline, and says so.
 *  - Grace that has run out becomes unpaid — the dashboard locks — and says so.
 *
 * Nothing here touches active subscriptions: PayPlus runs their schedule and
 * reports each charge to the callback, which is where those rows change.
 */
export type LifecycleSummary = { reminders: number; ended: number; locked: number };

const DAY = 24 * 60 * 60 * 1000;

export async function runBillingLifecycle(now: Date = new Date()): Promise<LifecycleSummary> {
  const summary: LifecycleSummary = { reminders: 0, ended: 0, locked: 0 };

  // 1. Trials still running: which countdown day is it?
  const trialing = await prisma.subscription.findMany({
    where: { status: "trialing", trialEndsAt: { not: null } },
    select: { id: true, therapistId: true, trialEndsAt: true, lastTrialReminderDay: true },
  });
  for (const sub of trialing) {
    const trialEndsAt = sub.trialEndsAt!;
    if (trialEndsAt <= now) {
      // 2. The trial is over: grace begins.
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "past_due", graceEndsAt: graceEndFor(trialEndsAt) },
      });
      await sendTrialEmail(sub.therapistId, { kind: "ended", graceDays: GRACE_DAYS });
      summary.ended++;
      continue;
    }
    const dayOfTrial = TRIAL_DAYS - Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY) + 1;
    const due = [...TRIAL_REMINDER_DAYS].filter((d) => d <= dayOfTrial && d > (sub.lastTrialReminderDay ?? 0)).pop();
    if (due === undefined) continue;
    await prisma.subscription.update({ where: { id: sub.id }, data: { lastTrialReminderDay: due } });
    await sendTrialEmail(sub.therapistId, { kind: "reminder", daysLeft: Math.max(0, TRIAL_DAYS - dayOfTrial) });
    summary.reminders++;
  }

  // 3. Grace that has run out — after a trial or after a failed renewal.
  const lapsed = await prisma.subscription.findMany({
    where: { status: "past_due", graceEndsAt: { lte: now } },
    select: { id: true, therapistId: true },
  });
  for (const sub of lapsed) {
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: "unpaid" } });
    await sendTrialEmail(sub.therapistId, { kind: "locked" });
    summary.locked++;
  }

  return summary;
}
