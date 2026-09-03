"use client";

import { useMemo } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";
import { addDaysUtc, startOfMonthUtc, startOfWeekUtc } from "@/lib/availability";
import { DAY_LABELS_SHORT } from "@/lib/labels";

/** The least a session needs to expose to be summarised on a month cell. Both the
 *  dashboard and the availability page pass richer rows than this. */
export type MonthGridSession = {
  startsAt: string;
  status: string;
  clientName: string | null;
};

/**
 * A month calendar where each day cell summarises that day's schedule: the names
 * of clients with a booking, plus compact counts of booked and open slots.
 *
 * Cells are deliberately terse. At a phone's ~49px column width a full label like
 * "2 מוזמן" overflows, so counts render as colour-coded number chips and at most
 * two names are spelled out before collapsing to "first +N".
 */
export function MonthGrid({
  anchorDate,
  today,
  sessions,
  timezone,
  onSelectDay,
}: {
  anchorDate: string;
  today: string;
  sessions: MonthGridSession[];
  timezone: string;
  onSelectDay: (date: string) => void;
}) {
  const currentMonth = anchorDate.slice(0, 7);
  const gridStart = startOfWeekUtc(startOfMonthUtc(anchorDate));
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDaysUtc(gridStart, i)), [gridStart]);

  const summaryByDay = useMemo(() => {
    const map = new Map<string, { open: number; bookedNames: string[] }>();
    for (const s of sessions) {
      if (s.status !== "open" && s.status !== "booked") continue;
      const dayKey = formatInTimeZone(new Date(s.startsAt), timezone, "yyyy-MM-dd");
      const entry = map.get(dayKey) ?? { open: 0, bookedNames: [] };
      if (s.status === "open") entry.open++;
      else entry.bookedNames.push(s.clientName ?? "מוזמן");
      map.set(dayKey, entry);
    }
    return map;
  }, [sessions, timezone]);

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-7 gap-1 text-center">
        {DAY_LABELS_SHORT.map((label) => (
          <div key={label} className="text-muted-foreground py-1 text-xs font-medium">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((date) => {
          const summary = summaryByDay.get(date);
          const isCurrentMonth = date.slice(0, 7) === currentMonth;
          const isToday = date === today;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDay(date)}
              className={cn(
                "border-border hover:bg-muted flex min-h-20 w-full flex-col items-start gap-1 overflow-hidden rounded-md border p-1.5 text-start transition-colors sm:min-h-24",
                !isCurrentMonth && "text-muted-foreground/40",
                isToday && "border-primary"
              )}
            >
              <span className={cn("num text-xs font-medium", isToday && "text-primary")}>{date.slice(8, 10)}</span>
              {summary && (
                <div className="flex w-full flex-col gap-0.5">
                  <div className="flex flex-wrap gap-0.5">
                    {summary.bookedNames.length > 0 && (
                      <span className="bg-st-booked/15 text-st-booked num inline-flex min-w-4 items-center justify-center rounded-sm px-1 text-[10px] font-bold">
                        {summary.bookedNames.length}
                      </span>
                    )}
                    {summary.open > 0 && (
                      <span className="bg-st-open/15 text-st-open num inline-flex min-w-4 items-center justify-center rounded-sm px-1 text-[10px]">
                        {summary.open}
                      </span>
                    )}
                  </div>
                  {summary.bookedNames.length > 0 &&
                    (summary.bookedNames.length <= 2 ? (
                      summary.bookedNames.map((name, i) => (
                        <span key={i} className="text-st-booked block w-full truncate text-[9px] leading-tight font-bold">
                          {name}
                        </span>
                      ))
                    ) : (
                      <span className="text-st-booked block w-full truncate text-[9px] leading-tight font-bold">
                        {summary.bookedNames[0]} +{summary.bookedNames.length - 1}
                      </span>
                    ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
