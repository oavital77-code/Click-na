import { prisma } from "@/lib/prisma";
import { addDaysUtc, generateOpenSessions, todayIn, zonedDateTimeToUtc } from "@/lib/availability";
import { blockedDates, yearsBetween, type HolidayPolicy } from "@/lib/holidays";
import { mapWithConcurrency } from "@/lib/concurrency";

/** How far ahead closed days are enforced. Past maxAdvanceDays anyway. */
const HORIZON_DAYS = 400;

/**
 * Removes the empty windows that the weekly hours put on a day the policy
 * closes. Only `open` slots: a booked one is somebody's appointment, a held
 * one is being booked this minute, a `blocked` one the therapist marked by
 * hand and may have a reason for.
 *
 * And only slots a rule generated. A window the therapist opened by hand on a
 * holiday is a decision — they work that day, whatever the country does — and
 * a nightly job that deleted it would be overruling them. Slots whose rule was
 * later deleted keep the same protection, which is right: the therapist chose
 * to keep those when they removed the rule.
 *
 * Each closed date is one range in the therapist's timezone.
 */
export async function pruneClosedDays(
  therapistId: string,
  timezone: string,
  policy: HolidayPolicy
): Promise<number> {
  const from = todayIn(timezone);
  const to = addDaysUtc(from, HORIZON_DAYS);
  const closed = [...blockedDates(policy, yearsBetween(from, to))].filter((d) => d >= from && d <= to);
  if (closed.length === 0) return 0;

  const result = await prisma.session.deleteMany({
    where: {
      therapistId,
      status: "open",
      generatedFromRuleId: { not: null },
      OR: closed.map((date) => ({
        startsAt: { gte: zonedDateTimeToUtc(date, "00:00", timezone), lt: zonedDateTimeToUtc(addDaysUtc(date, 1), "00:00", timezone) },
      })),
    },
  });
  return result.count;
}

/**
 * After the therapist changes the switches: take away what is now closed and
 * open what is now allowed. Regeneration is idempotent, so calling it when
 * nothing changed costs a query and creates nothing.
 */
export async function applyHolidayPolicy(therapistId: string) {
  const therapist = await prisma.therapist.findUniqueOrThrow({
    where: { id: therapistId },
    select: { timezone: true, settings: { select: { blockHolidays: true, blockHolidayEves: true, blockCholHamoed: true } } },
  });
  if (!therapist.settings) return { removed: 0, created: 0 };
  const removed = await pruneClosedDays(therapistId, therapist.timezone, therapist.settings);
  const { created } = await prisma.$transaction((tx) => generateOpenSessions(tx, therapistId));
  return { removed, created };
}

/**
 * The daily sweep. Rules created before the switches existed, and slots
 * opened by hand on a holiday, both leave empty windows on closed days; this
 * is what makes "block holidays" mean it for every therapist, every year,
 * without anyone importing anything.
 */
export async function pruneClosedDaysForEveryone(): Promise<number> {
  const therapists = await prisma.therapist.findMany({
    where: {
      status: "active",
      settings: { is: { OR: [{ blockHolidays: true }, { blockHolidayEves: true }, { blockCholHamoed: true }] } },
    },
    select: { id: true, timezone: true, settings: { select: { blockHolidays: true, blockHolidayEves: true, blockCholHamoed: true } } },
  });
  let removed = 0;
  // Each therapist has their own timezone, so it stays one delete per
  // therapist — but three at a time, inside the cron's minute.
  await mapWithConcurrency(therapists, 3, async (t) => {
    if (!t.settings) return;
    // Two steps on purpose: `removed += await …` reads the total before the
    // await and writes it back after, so a neighbour's count gets lost.
    const count = await pruneClosedDays(t.id, t.timezone, t.settings);
    removed += count;
  });
  return removed;
}
