import { fromZonedTime } from "date-fns-tz";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Interprets "HH:MM" on a given calendar date as wall-clock time in `timezone`, returning the UTC instant. */
export function zonedDateTimeToUtc(dateStr: string, timeStr: string, timezone: string) {
  return fromZonedTime(`${dateStr} ${timeStr}:00`, timezone);
}

export function addDaysUtc(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Turns a therapist's recurring AvailabilityRule rows into concrete open Session
 * slots for the window allowed by their settings (min_notice_hours..max_advance_days).
 *
 * Calendar-day walking and rule times are read via UTC getters even though they
 * represent wall-clock values (spec 6.2's @db.Time columns, and this function's own
 * date-only arithmetic) — that keeps day-of-week and time-of-day reads independent of
 * the server process's own system timezone. Only the final local-wall-time -> instant
 * conversion uses the therapist's actual IANA timezone (spec 6.3), via date-fns-tz,
 * so DST transitions (spec 11.4) resolve correctly instead of via hand-rolled offset math.
 *
 * Bulk-inserts with skipDuplicates so slots overlapping an existing open/held/booked
 * session (the DB's GiST exclusion constraint) or an already-generated slot are silently
 * skipped rather than erroring — safe to re-run.
 */
export async function generateOpenSessions(tx: Tx, therapistId: string) {
  // Sequential, not Promise.all: a transaction runs on one reserved connection,
  // so concurrent queries against `tx` just get serialized anyway (and the pg
  // driver warns that relying on that is deprecated).
  const therapist = await tx.therapist.findUniqueOrThrow({
    where: { id: therapistId },
    select: { timezone: true },
  });
  const settings = await tx.therapistSettings.findUnique({ where: { therapistId } });
  const rules = await tx.availabilityRule.findMany({ where: { therapistId, isActive: true } });

  if (!settings || rules.length === 0) return { created: 0 };

  const now = new Date();
  const earliestStart = new Date(now.getTime() + settings.minNoticeHours * 60 * 60 * 1000);
  const todayStr = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;

  const candidates: Prisma.SessionCreateManyInput[] = [];

  for (let offset = 0; offset <= settings.maxAdvanceDays; offset++) {
    const dateStr = addDaysUtc(todayStr, offset);
    const dayOfWeek = new Date(`${dateStr}T00:00:00Z`).getUTCDay();

    for (const rule of rules) {
      if (rule.dayOfWeek !== dayOfWeek) continue;
      if (rule.validFrom && dateStr < rule.validFrom.toISOString().slice(0, 10)) continue;
      if (rule.validUntil && dateStr > rule.validUntil.toISOString().slice(0, 10)) continue;

      const startMinutes = rule.startTime.getUTCHours() * 60 + rule.startTime.getUTCMinutes();
      const endMinutes = rule.endTime.getUTCHours() * 60 + rule.endTime.getUTCMinutes();
      const step =
        rule.slotDurationMinutes + settings.bufferBeforeMinutes + settings.bufferAfterMinutes;

      for (
        let slotStart = startMinutes;
        slotStart + rule.slotDurationMinutes <= endMinutes;
        slotStart += step
      ) {
        const slotEnd = slotStart + rule.slotDurationMinutes;
        const startTimeStr = `${pad(Math.floor(slotStart / 60))}:${pad(slotStart % 60)}`;
        const endTimeStr = `${pad(Math.floor(slotEnd / 60))}:${pad(slotEnd % 60)}`;

        const startsAt = zonedDateTimeToUtc(dateStr, startTimeStr, therapist.timezone);
        if (startsAt < earliestStart) continue;

        candidates.push({
          therapistId,
          startsAt,
          endsAt: zonedDateTimeToUtc(dateStr, endTimeStr, therapist.timezone),
          generatedFromRuleId: rule.id,
        });
      }
    }
  }

  if (candidates.length === 0) return { created: 0 };

  const result = await tx.session.createMany({ data: candidates, skipDuplicates: true });
  return { created: result.count };
}
