import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { accessState } from "@/lib/access";
import { dailyDigestEmail } from "@/lib/email-templates";
import { DEFAULT_LOCALE } from "@/i18n";

/**
 * The operator's morning mail: the last 24 hours in numbers, and anything the
 * daily run needs a person for. It goes out every day, quiet days included —
 * so a morning without it is itself the alert that the daily job did not run.
 */
export type DailyDigest = {
  since: Date;
  until: Date;
  signups: { name: string; email: string }[];
  accounts: { total: number; trialing: number; paying: number; grace: number; locked: number };
  /** Trials ending within the next 7 days: the people worth a personal word. */
  trialsEndingSoon: { name: string; email: string; endsAt: Date }[];
  bookings: { created: number; canceled: number };
  reminders: { sent: number; failed: number };
  /** Every failed send of any kind in the window — reminders, confirmations, account mail. */
  failedMessages: number;
  payments: { count: number; sumIls: number };
  problems: string[];
};

const DAY = 24 * 60 * 60 * 1000;

export async function buildDailyDigest(problems: string[], now: Date = new Date()): Promise<DailyDigest> {
  const since = new Date(now.getTime() - DAY);
  const inAWeek = new Date(now.getTime() + 7 * DAY);

  const [signups, therapists, created, canceled, remindersSent, remindersFailed, failedMessages, payments] = await Promise.all([
    prisma.therapist.findMany({
      where: { status: "active", createdAt: { gte: since, lt: now } },
      orderBy: { createdAt: "asc" },
      select: { fullName: true, email: true },
    }),
    prisma.therapist.findMany({
      where: { status: "active" },
      select: { fullName: true, email: true, subscription: true },
    }),
    prisma.booking.count({ where: { createdAt: { gte: since, lt: now } } }),
    prisma.booking.count({ where: { canceledAt: { gte: since, lt: now } } }),
    prisma.notification.count({ where: { type: "reminder", status: "sent", sentAt: { gte: since, lt: now } } }),
    prisma.notification.count({ where: { type: "reminder", status: "failed", updatedAt: { gte: since, lt: now } } }),
    prisma.notification.count({ where: { status: "failed", updatedAt: { gte: since, lt: now } } }),
    prisma.payment.aggregate({
      where: { status: "succeeded", paidAt: { gte: since, lt: now } },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const accounts = { total: 0, trialing: 0, paying: 0, grace: 0, locked: 0 };
  const trialsEndingSoon: DailyDigest["trialsEndingSoon"] = [];
  for (const t of therapists) {
    if (!t.subscription) continue;
    accounts.total++;
    const state = accessState(t.subscription, now);
    if (state.kind === "trialing") {
      accounts.trialing++;
      if (state.trialEndsAt <= inAWeek) trialsEndingSoon.push({ name: t.fullName, email: t.email, endsAt: state.trialEndsAt });
    } else if (state.kind === "active" || state.kind === "canceling") accounts.paying++;
    else if (state.kind === "grace") accounts.grace++;
    else accounts.locked++;
  }
  trialsEndingSoon.sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());

  return {
    since,
    until: now,
    signups: signups.map((s) => ({ name: s.fullName, email: s.email })),
    accounts,
    trialsEndingSoon,
    bookings: { created, canceled },
    reminders: { sent: remindersSent, failed: remindersFailed },
    failedMessages,
    payments: { count: payments._count, sumIls: Number(payments._sum.amount ?? 0) },
    problems,
  };
}

/** Silent without OWNER_NOTIFICATION_EMAIL, like every other operator mail. */
export async function sendDailyDigest(problems: string[], now: Date = new Date()) {
  if (problems.length > 0) console.error("[cron:alert]", problems);
  const recipient = process.env.OWNER_NOTIFICATION_EMAIL;
  if (!recipient) return;
  const digest = await buildDailyDigest(problems, now);
  const { subject, html } = dailyDigestEmail({ locale: DEFAULT_LOCALE, timezone: "Asia/Jerusalem", digest });
  const result = await sendEmail({ to: recipient, subject, html });
  if (!result.ok) throw new Error(`daily digest not sent: ${result.error}`);
}
