"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { he } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DAY_LABELS_SHORT } from "@/lib/labels";
import { sessionStatusTone, statusBadgeClass } from "@/lib/status-badge";

type SessionRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  clientName: string | null;
};

type Props = {
  timezone: string;
  weekDates: string[]; // 7 dates, Sunday..Saturday, yyyy-MM-dd
  today: string;
  sessions: SessionRow[];
};

export function DashboardSchedule({ timezone, weekDates, today, sessions }: Props) {
  const [view, setView] = useState<"calendar" | "list">("calendar");

  const byDayAndTime = useMemo(() => {
    const map = new Map<string, SessionRow>();
    const times = new Set<string>();
    for (const session of sessions) {
      const dayKey = formatInTimeZone(new Date(session.startsAt), timezone, "yyyy-MM-dd");
      const timeKey = formatInTimeZone(new Date(session.startsAt), timezone, "HH:mm");
      map.set(`${dayKey}T${timeKey}`, session);
      times.add(timeKey);
    }
    return { map, times: [...times].sort() };
  }, [sessions, timezone]);

  const bookedOrOpen = useMemo(
    () => [...sessions].filter((s) => s.status === "booked" || s.status === "open").sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [sessions]
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-lg">הלו״ז שלי</CardTitle>
        <div className="bg-muted inline-flex gap-1 rounded-md p-1">
          <button
            type="button"
            onClick={() => setView("calendar")}
            className={cn(
              "min-h-9 rounded-sm px-3 text-sm font-medium transition-colors",
              view === "calendar" ? "bg-card shadow-xs" : "text-muted-foreground"
            )}
          >
            תצוגת יומן
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={cn(
              "min-h-9 rounded-sm px-3 text-sm font-medium transition-colors",
              view === "list" ? "bg-card shadow-xs" : "text-muted-foreground"
            )}
          >
            תצוגת רשימה
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {view === "calendar" ? (
          byDayAndTime.times.length === 0 ? (
            <EmptyCalendarHint />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="w-12" />
                    {weekDates.map((dateKey, i) => {
                      const dow = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
                      const isToday = dateKey === today;
                      return (
                        <th
                          key={dateKey}
                          className={cn("pb-2 text-center font-medium", i >= 3 && "hidden md:table-cell")}
                        >
                          <div className={isToday ? "text-primary" : undefined}>{DAY_LABELS_SHORT[dow]}</div>
                          <div className="num text-muted-foreground text-xs">
                            {dateKey.slice(8, 10)}.{dateKey.slice(5, 7)}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {byDayAndTime.times.map((time) => (
                    <tr key={time} className="border-border border-t">
                      <td className="num text-muted-foreground py-2 pe-2 text-xs">{time}</td>
                      {weekDates.map((dateKey, i) => {
                        const session = byDayAndTime.map.get(`${dateKey}T${time}`);
                        return (
                          <td key={dateKey} className={cn("p-1 text-center align-middle", i >= 3 && "hidden md:table-cell")}>
                            {session ? (
                              <span
                                title={session.clientName ?? undefined}
                                className={statusBadgeClass(sessionStatusTone(session.status)) + " w-full min-h-9 justify-center"}
                              >
                                {session.clientName ?? "פנוי"}
                              </span>
                            ) : (
                              <Link
                                href="/dashboard/availability"
                                className="border-muted-foreground/30 hover:border-primary hover:text-primary text-muted-foreground/50 flex min-h-9 w-full items-center justify-center rounded-md border border-dashed text-xs transition-colors"
                                aria-label="פתח חלון בזמן זה"
                              >
                                +
                              </Link>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-muted-foreground mt-3 text-xs md:hidden">
                מציג 3 ימים. לתצוגה מלאה — <Link href="/dashboard/availability" className="text-primary underline underline-offset-2">ניהול זמינות</Link>
              </p>
            </div>
          )
        ) : bookedOrOpen.length === 0 ? (
          <EmptyCalendarHint />
        ) : (
          <ul className="flex flex-col gap-2">
            {bookedOrOpen.map((session) => (
              <li
                key={session.id}
                className="border-border flex min-h-11 items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span className="num text-muted-foreground">
                  {formatInTimeZone(new Date(session.startsAt), timezone, "EEEE, d.M", { locale: he })} ·{" "}
                  {formatInTimeZone(new Date(session.startsAt), timezone, "HH:mm")}
                </span>
                <span className={statusBadgeClass(sessionStatusTone(session.status))}>
                  {session.clientName ?? "פנוי"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyCalendarHint() {
  return (
    <p className="text-muted-foreground py-6 text-center text-sm">
      אין תורים או חלונות פתוחים השבוע —{" "}
      <Link href="/dashboard/availability" className="text-primary underline underline-offset-2">
        פתחו חלון טיפול
      </Link>
    </p>
  );
}
