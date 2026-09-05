"use client";

import { useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DAY_LABELS_SHORT } from "@/lib/labels";

type Session = { startsAt: string; endsAt: string; status: string };

type DayLoad = { dow: number; bookedMinutes: number; openMinutes: number };

/**
 * Both figures come from the week the dashboard already loaded — no extra query,
 * and they can never disagree with the calendar directly above them.
 *
 * One hue, not two. Booked-versus-open looks like two categories, but terracotta
 * against the palette's sage fails colour-blind separation badly (ΔE 3.5 for
 * protanopia, and only 12.5 even with full colour vision — below the legibility
 * floor). It is really a part-of-whole: hours taken out of hours offered. So it
 * is drawn as one fill on a capacity track, read by lightness, which every form
 * of colour vision resolves.
 */
function buildLoad(sessions: Session[], timezone: string): DayLoad[] {
  const days: DayLoad[] = Array.from({ length: 7 }, (_, dow) => ({
    dow,
    bookedMinutes: 0,
    openMinutes: 0,
  }));

  for (const session of sessions) {
    const start = new Date(session.startsAt);
    const minutes = (new Date(session.endsAt).getTime() - start.getTime()) / 60000;
    const dow = Number(formatInTimeZone(start, timezone, "i")) % 7; // date-fns: 1=Mon..7=Sun
    const day = days[dow];
    if (session.status === "booked") day.bookedMinutes += minutes;
    else if (session.status === "open") day.openMinutes += minutes;
  }

  return days;
}

const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

export function WeekInsights({
  sessions,
  timezone,
}: {
  sessions: Session[];
  timezone: string;
}) {
  const load = useMemo(() => buildLoad(sessions, timezone), [sessions, timezone]);

  const totalBooked = load.reduce((sum, d) => sum + d.bookedMinutes, 0);
  const totalOffered = totalBooked + load.reduce((sum, d) => sum + d.openMinutes, 0);
  const occupancy = totalOffered === 0 ? 0 : Math.round((totalBooked / totalOffered) * 100);

  return (
    <div className="grid gap-4 md:grid-cols-[1.6fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">שעות תפוסות לפי יום</CardTitle>
        </CardHeader>
        <CardContent>
          <LoadChart load={load} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">תפוסה השבוע</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center">
          <OccupancyRing
            percent={occupancy}
            bookedHours={hours(totalBooked)}
            offeredHours={hours(totalOffered)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function LoadChart({ load }: { load: DayLoad[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const peak = Math.max(...load.map((d) => d.bookedMinutes + d.openMinutes), 60);
  const empty = load.every((d) => d.bookedMinutes + d.openMinutes === 0);

  if (empty) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        אין עדיין שעות בשבוע הזה.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Bars run right to left so the week reads in the same direction as the
          page and as the calendar above it. */}
      <div className="flex h-40 items-end justify-between gap-2" dir="rtl">
        {load.map((day) => {
          const offered = day.bookedMinutes + day.openMinutes;
          const trackHeight = offered === 0 ? 0 : Math.max((offered / peak) * 100, 4);
          const fillHeight = offered === 0 ? 0 : (day.bookedMinutes / offered) * 100;
          const isHovered = hovered === day.dow;

          return (
            <div
              key={day.dow}
              className="relative flex h-full flex-1 flex-col items-center justify-end gap-1.5"
              onMouseEnter={() => setHovered(day.dow)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(day.dow)}
              onBlur={() => setHovered(null)}
              tabIndex={0}
            >
              {isHovered && offered > 0 && (
                <div className="bg-foreground text-background absolute bottom-full z-10 mb-1 rounded-md px-2 py-1 text-xs whitespace-nowrap">
                  <span className="num">{hours(day.bookedMinutes)}</span> מתוך{" "}
                  <span className="num">{hours(offered)}</span> שעות
                </div>
              )}

              {/* The track is the hours offered; the fill is the hours taken. */}
              <div
                className="bg-secondary relative w-full max-w-10 rounded-t-[4px]"
                style={{ height: `${trackHeight}%` }}
              >
                <div
                  className="bg-st-booked absolute inset-x-0 bottom-0 rounded-t-[4px] transition-[height]"
                  style={{ height: `${fillHeight}%` }}
                />
              </div>

              <span className="text-muted-foreground text-[11px] leading-none font-medium">
                {DAY_LABELS_SHORT[day.dow]}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-muted-foreground text-xs">
        הגובה המלא הוא השעות שפתחת, והחלק הכהה הוא מה שכבר נתפס.
      </p>
    </div>
  );
}

function OccupancyRing({
  percent,
  bookedHours,
  offeredHours,
}: {
  percent: number;
  bookedHours: number;
  offeredHours: number;
}) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <svg viewBox="0 0 128 128" className="size-40" role="img" aria-label={`תפוסה ${percent} אחוז`}>
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke="hsl(var(--secondary))"
            strokeWidth="14"
          />
          {percent > 0 && (
            <circle
              cx="64"
              cy="64"
              r={radius}
              fill="none"
              stroke="hsl(var(--st-booked))"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${(percent / 100) * circumference} ${circumference}`}
              // Start the arc at twelve o'clock and run it clockwise.
              transform="rotate(-90 64 64)"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="num text-3xl font-bold leading-none">{percent}%</span>
        </div>
      </div>
      <p className="text-muted-foreground text-center text-xs">
        <span className="num">{bookedHours}</span> מתוך <span className="num">{offeredHours}</span> שעות
        שפתחת
      </p>
    </div>
  );
}
