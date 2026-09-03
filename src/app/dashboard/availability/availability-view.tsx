"use client";

import { useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { addDaysUtc, startOfWeekUtc } from "@/lib/availability";
import { DAY_LABELS_SHORT } from "@/lib/labels";
import { sessionStatusTone, statusBadgeClass } from "@/lib/status-badge";

const STATUS_LABELS: Record<string, string> = {
  open: "פנוי",
  blocked: "חסום",
  booked: "מוזמן",
  held: "מוחזק זמנית",
  completed: "הושלם",
  canceled: "בוטל",
};

type SessionRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  clientName: string | null;
};

type Props = {
  timezone: string;
  initialWeekStart: string;
  initialSessions: SessionRow[];
};

export function AvailabilityView({ timezone, initialWeekStart, initialSessions }: Props) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [sessions, setSessions] = useState(initialSessions);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [today] = useState(() => formatInTimeZone(new Date(), timezone, "yyyy-MM-dd"));
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysUtc(weekStart, i)), [weekStart]);

  async function loadWeek(newWeekStart: string) {
    setLoadingWeek(true);
    setFormError(null);
    try {
      const from = new Date(`${newWeekStart}T00:00:00Z`);
      const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
      const res = await fetch(`/api/sessions?from=${from.toISOString()}&to=${to.toISOString()}`);
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setSessions(
        data.sessions.map((s: { id: string; startsAt: string; endsAt: string; status: string; booking: { clientNameSnapshot: string } | null }) => ({
          id: s.id,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          status: s.status,
          clientName: s.booking?.clientNameSnapshot ?? null,
        }))
      );
      setWeekStart(newWeekStart);
    } catch {
      setFormError("שגיאה בטעינת השבוע, נסה שוב");
    } finally {
      setLoadingWeek(false);
    }
  }

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

  async function handleAdd() {
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, startTime, endTime }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(
          data.error === "overlaps_existing"
            ? "יש כבר חלון בזמן הזה"
            : data.error === "in_past"
              ? "לא ניתן לפתוח חלון בעבר"
              : "שגיאה בהוספת החלון"
        );
        return;
      }
      const addedWeekStart = startOfWeekUtc(date);
      if (addedWeekStart === weekStart) {
        setSessions((prev) => [
          ...prev,
          {
            id: data.session.id,
            startsAt: data.session.startsAt,
            endsAt: data.session.endsAt,
            status: data.session.status,
            clientName: null,
          },
        ]);
      }
    } catch {
      setFormError("שגיאת רשת, נסה שוב");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(session: SessionRow) {
    const nextStatus = session.status === "open" ? "blocked" : "open";
    setPendingIds((prev) => new Set(prev).add(session.id));
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setSessions((prev) =>
          prev.map((s) => (s.id === session.id ? { ...s, status: nextStatus } : s))
        );
      }
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(session.id);
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            לוח שבועי · {weekDates[0].slice(8, 10)}.{weekDates[0].slice(5, 7)}–
            {weekDates[6].slice(8, 10)}.{weekDates[6].slice(5, 7)}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingWeek}
              onClick={() => loadWeek(addDaysUtc(weekStart, -7))}
            >
              שבוע קודם
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingWeek || weekStart === startOfWeekUtc(today)}
              onClick={() => loadWeek(startOfWeekUtc(today))}
            >
              היום
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingWeek}
              onClick={() => loadWeek(addDaysUtc(weekStart, 7))}
            >
              שבוע הבא
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {byDayAndTime.times.length === 0 ? (
            <p className="text-muted-foreground text-sm">אין חלונות טיפול בשבוע זה</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="w-14" />
                    {weekDates.map((dateKey) => {
                      const dow = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
                      const isToday = dateKey === today;
                      return (
                        <th key={dateKey} className="pb-2 text-center font-medium">
                          <div className={isToday ? "text-primary" : undefined}>
                            {DAY_LABELS_SHORT[dow]}
                          </div>
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
                      {weekDates.map((dateKey) => {
                        const session = byDayAndTime.map.get(`${dateKey}T${time}`);
                        return (
                          <td key={dateKey} className="p-1 text-center align-middle">
                            {session ? (
                              <button
                                type="button"
                                disabled={
                                  pendingIds.has(session.id) ||
                                  (session.status !== "open" && session.status !== "blocked")
                                }
                                onClick={() => toggleStatus(session)}
                                title={session.clientName ?? undefined}
                                className={statusBadgeClass(sessionStatusTone(session.status)) + " w-full justify-center disabled:opacity-100"}
                              >
                                {session.clientName ?? STATUS_LABELS[session.status] ?? session.status}
                              </button>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>הוסף חלון טיפול</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="date">תאריך</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="startTime">משעה</Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="endTime">עד שעה</Label>
              <Input
                id="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
            <Button type="button" disabled={submitting} onClick={handleAdd}>
              {submitting ? "מוסיף..." : "+ הוסף חלון"}
            </Button>
          </div>
          {formError && <p className="text-destructive text-sm">{formError}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
