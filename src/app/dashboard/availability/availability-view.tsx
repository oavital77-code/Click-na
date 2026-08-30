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
import { cn } from "@/lib/utils";
import { addDaysUtc } from "@/lib/availability";

const DAY_LABELS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

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
  initialSessions: SessionRow[];
};

export function AvailabilityView({ timezone, initialSessions }: Props) {
  const [sessions, setSessions] = useState(initialSessions);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [today] = useState(() => formatInTimeZone(new Date(), timezone, "yyyy-MM-dd"));
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");

  const days = useMemo(() => {
    const buckets = new Map<string, SessionRow[]>();
    for (let i = 0; i < 7; i++) {
      buckets.set(addDaysUtc(today, i), []);
    }
    for (const session of sessions) {
      const key = formatInTimeZone(new Date(session.startsAt), timezone, "yyyy-MM-dd");
      buckets.get(key)?.push(session);
    }
    return buckets;
  }, [sessions, timezone, today]);

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
      setSessions((prev) =>
        [
          ...prev,
          {
            id: data.session.id,
            startsAt: data.session.startsAt,
            endsAt: data.session.endsAt,
            status: data.session.status,
            clientName: null,
          },
        ].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      );
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

      <div className="flex flex-col gap-4">
        {[...days.entries()].map(([dateKey, daySessions]) => {
          const dayOfWeek = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
          return (
            <Card key={dateKey}>
              <CardHeader>
                <CardTitle className="text-base">
                  {DAY_LABELS[dayOfWeek]}, {dateKey}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {daySessions.length === 0 ? (
                  <p className="text-muted-foreground text-sm">אין חלונות ביום זה</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {daySessions.map((session) => (
                      <li
                        key={session.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                      >
                        <span>
                          {formatInTimeZone(new Date(session.startsAt), timezone, "HH:mm")}–
                          {formatInTimeZone(new Date(session.endsAt), timezone, "HH:mm")}
                          {session.clientName && ` · ${session.clientName}`}
                        </span>
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs",
                              session.status === "open" && "bg-green-100 text-green-800",
                              session.status === "blocked" && "bg-neutral-200 text-neutral-700",
                              session.status === "booked" && "bg-blue-100 text-blue-800"
                            )}
                          >
                            {STATUS_LABELS[session.status] ?? session.status}
                          </span>
                          {(session.status === "open" || session.status === "blocked") && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={pendingIds.has(session.id)}
                              onClick={() => toggleStatus(session)}
                            >
                              {session.status === "open" ? "סגור" : "פתח"}
                            </Button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
