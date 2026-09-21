import { prisma } from "@/lib/prisma";
import { addDaysUtc, generateOpenSessions, zonedDateTimeToUtc } from "@/lib/availability";
import { blockedDates, yearsBetween, type HolidayPolicy } from "@/lib/holidays";

/** How far ahead closed days are enforced. Past maxAdvanceDays anyway. */
const HORIZON_DAYS = 400;

function todayIn(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/**
 * Removes the empty windows that sit on a day the policy closes. Only `open`
 * slots: a booked one is somebody's appointment, a held one is being booked
 * this minute, a `blocked` one the therapist marked by hand and may have a
 * reason for. Each closed date is one range in the therapist's timezone.
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
  for (const t of therapists) {
    if (t.settings) removed += await pruneClosedDays(t.id, t.timezone, t.settings);
  }
  return removed;
}
