"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { addDaysUtc, addMonthsUtc, startOfMonthUtc, startOfWeekUtc, zonedDateTimeToUtc } from "@/lib/availability";
import { useI18n } from "@/i18n/client";
import { buildTimeAxis } from "@/lib/schedule-grid";
import { MonthGrid } from "@/components/month-grid";
import { sessionStatusTone, statusBadgeClass } from "@/lib/status-badge";
import { cn } from "@/lib/utils";
import { LocationDot, LocationFilter, LocationSelect, type PlaceOption } from "@/components/location-filter";

type SessionRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  clientName: string | null;
  locationId: string;
  locationColor: string;
};

type Props = {
  timezone: string;
  initialWeekStart: string;
  defaultDurationMinutes: number;
  locations: PlaceOption[];
  initialSessions: SessionRow[];
};

type Granularity = "week" | "month";

export function AvailabilityView({
  timezone,
  initialWeekStart,
  defaultDurationMinutes,
  locations,
  initialSessions,
}: Props) {
  const { m } = useI18n();
  const a = m.availability;
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [anchorDate, setAnchorDate] = useState(initialWeekStart);
  const [allSessions, setSessions] = useState(initialSessions);
  const [placeFilter, setPlaceFilter] = useState<string | null>(null);
  const sessions = useMemo(
    () => (placeFilter ? allSessions.filter((session) => session.locationId === placeFilter) : allSessions),
    [allSessions, placeFilter]
  );
  const manyPlaces = locations.length > 1;
  const [placeId, setPlaceId] = useState(locations[0]?.id ?? "");
  const [loadingWeek, setLoadingWeek] = useState(false);
  const isFirstRender = useRef(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [today] = useState(() => formatInTimeZone(new Date(), timezone, "yyyy-MM-dd"));
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");

  const weekStart = startOfWeekUtc(anchorDate);
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysUtc(startOfWeekUtc(anchorDate), i)),
    [anchorDate]
  );

  const range = useMemo(() => {
    if (granularity === "month") {
      const gridStart = startOfWeekUtc(startOfMonthUtc(anchorDate));
      return { from: gridStart, to: addDaysUtc(gridStart, 42) };
    }
    const start = startOfWeekUtc(anchorDate);
    return { from: start, to: addDaysUtc(start, 7) };
  }, [granularity, anchorDate]);

  // The server already delivered the initial week, so skip the first fetch and
  // only hit the API once the user actually navigates or switches granularity.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    let cancelled = false;
    setLoadingWeek(true);
    setFormError(null);
    const fromIso = zonedDateTimeToUtc(range.from, "00:00", timezone).toISOString();
    const toIso = zonedDateTimeToUtc(range.to, "00:00", timezone).toISOString();
    fetch(`/api/sessions?from=${fromIso}&to=${toIso}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: { sessions: { id: string; startsAt: string; endsAt: string; status: string; booking: { clientNameSnapshot: string } | null; location: { id: string; color: string } }[] }) => {
        if (cancelled) return;
        setSessions(
          data.sessions.map((s) => ({
            id: s.id,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            status: s.status,
            clientName: s.booking?.clientNameSnapshot ?? null,
            locationId: s.location.id,
            locationColor: s.location.color,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setFormError(a.loadError);
      })
      .finally(() => {
        if (!cancelled) setLoadingWeek(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, timezone, a.loadError]);

  const byDayAndTime = useMemo(() => {
    const map = new Map<string, SessionRow>();
    const times = new Set<string>();
    for (const session of sessions) {
      const dayKey = formatInTimeZone(new Date(session.startsAt), timezone, "yyyy-MM-dd");
      const timeKey = formatInTimeZone(new Date(session.startsAt), timezone, "HH:mm");
      map.set(`${dayKey}T${timeKey}`, session);
      times.add(timeKey);
    }
    return { map, times: buildTimeAxis(defaultDurationMinutes, times) };
  }, [sessions, timezone, defaultDurationMinutes]);

  async function handleAdd() {
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, startTime, endTime, locationId: manyPlaces ? placeId : undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(
          data.error === "overlaps_existing"
            ? a.overlaps
            : data.error === "in_past"
              ? a.inPast
              : a.addError
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
            locationId: data.session.location?.id ?? data.session.locationId,
            locationColor: data.session.location?.color ?? locations[0]?.color ?? "#000000",
          },
        ]);
      }
    } catch {
      setFormError(m.common.networkError);
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
        <CardHeader className="flex flex-col items-stretch gap-3">
          <div className="flex flex-col items-center gap-2 md:flex-row md:justify-between">
            <CardTitle className="text-base">
              {granularity === "month"
                ? `${m.labels.months[Number(anchorDate.slice(5, 7)) - 1]} ${anchorDate.slice(0, 4)}`
                : a.weekTitle(`${weekDates[0].slice(8, 10)}.${weekDates[0].slice(5, 7)}–${weekDates[6].slice(8, 10)}.${weekDates[6].slice(5, 7)}`)}
            </CardTitle>
            <div className="bg-muted inline-flex gap-1 rounded-md p-1">
              {(["week", "month"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    setGranularity(g);
                    setAnchorDate((d) => (g === "month" ? startOfMonthUtc(d) : d));
                  }}
                  className={cn(
                    "min-h-11 rounded-sm px-3 text-sm font-medium transition-colors md:min-h-9",
                    granularity === g ? "bg-card shadow-xs" : "text-muted-foreground"
                  )}
                >
                  {g === "week" ? a.week : a.month}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2 md:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingWeek}
              onClick={() =>
                setAnchorDate((d) => (granularity === "month" ? addMonthsUtc(d, -1) : addDaysUtc(startOfWeekUtc(d), -7)))
              }
            >
              {granularity === "month" ? a.prevMonth : a.prevWeek}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                loadingWeek ||
                (granularity === "month"
                  ? startOfMonthUtc(anchorDate) === startOfMonthUtc(today)
                  : weekStart === startOfWeekUtc(today))
              }
              onClick={() => setAnchorDate(granularity === "month" ? startOfMonthUtc(today) : today)}
            >
              {a.today}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingWeek}
              onClick={() =>
                setAnchorDate((d) => (granularity === "month" ? addMonthsUtc(d, 1) : addDaysUtc(startOfWeekUtc(d), 7)))
              }
            >
              {granularity === "month" ? a.nextMonth : a.nextWeek}
            </Button>
          </div>
          <LocationFilter locations={locations} value={placeFilter} onChange={setPlaceFilter} />
        </CardHeader>
        <CardContent>
          {granularity === "month" ? (
            <MonthGrid
              anchorDate={anchorDate}
              today={today}
              sessions={sessions}
              timezone={timezone}
              onSelectDay={(date) => {
                setAnchorDate(date);
                setGranularity("week");
              }}
            />
          ) : (
            // Same pinned-hours + column snapping as the dashboard grid, so a
            // swipe on a phone never stops mid-cell or hides the hour labels.
            <div className="snap-x snap-mandatory scroll-ps-14 overflow-x-auto">
              <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="bg-card sticky start-0 z-10 w-14" />
                    {weekDates.map((dateKey) => {
                      const dow = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
                      const isToday = dateKey === today;
                      return (
                        <th key={dateKey} className="snap-start pb-2 text-center font-medium">
                          <div className={isToday ? "text-primary" : undefined}>
                            {m.labels.daysShort[dow]}
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
                    <tr key={time}>
                      <td className="num text-muted-foreground border-border bg-card sticky start-0 z-10 border-t py-2 pe-2 text-xs">
                        {time}
                      </td>
                      {weekDates.map((dateKey) => {
                        const session = byDayAndTime.map.get(`${dateKey}T${time}`);
                        return (
                          <td
                            key={dateKey}
                            className="border-border snap-start border-t p-1 text-center align-middle"
                          >
                            {session ? (
                              <button
                                type="button"
                                disabled={
                                  pendingIds.has(session.id) ||
                                  (session.status !== "open" && session.status !== "blocked")
                                }
                                onClick={() => toggleStatus(session)}
                                title={session.clientName ?? undefined}
                                className={statusBadgeClass(sessionStatusTone(session.status)) + " w-full min-h-11 md:min-h-9 justify-center disabled:opacity-100"}
                              >
                                {manyPlaces && <LocationDot color={session.locationColor} />}
                                {session.clientName ?? a.status[session.status as keyof typeof a.status] ?? session.status}
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
              <p className="text-muted-foreground mt-3 text-xs md:hidden">{a.scrollHint}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{a.addSlot}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
            <div className="flex flex-col gap-2">
              <Label htmlFor="date">{a.date}</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="startTime">{a.from}</Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="endTime">{a.to}</Label>
              <Input
                id="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
            <LocationSelect id="slot-place" locations={locations} value={placeId} onChange={setPlaceId} label={m.locations.where} />
            <Button type="button" className="w-full md:w-auto" disabled={submitting} onClick={handleAdd}>
              {submitting ? a.adding : a.addButton}
            </Button>
          </div>
          {formError && <p className="text-destructive text-sm">{formError}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
