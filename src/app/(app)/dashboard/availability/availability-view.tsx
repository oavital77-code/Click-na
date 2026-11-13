"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { addDaysUtc, addMonthsUtc, startOfMonthUtc, startOfWeekUtc, zonedDateTimeToUtc } from "@/lib/availability";
import { useI18n } from "@/i18n/client";
import { TimeGrid, type ItemInfo } from "@/components/time-grid";
import { NewSlotForm, SlotCell, type ActionResult } from "../dashboard-schedule";
import { AddSlotDialog } from "@/components/add-slot-dialog";
import { MonthGrid } from "@/components/month-grid";
import { cn } from "@/lib/utils";
import { LocationFilter, type PlaceOption } from "@/components/location-filter";
import { holidaysByDate, yearsBetween } from "@/lib/holidays";

type SessionRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  clientName: string | null;
  blockedNote: string | null;
  locationId: string;
  locationColor: string;
};

type Props = {
  timezone: string;
  initialWeekStart: string;
  defaultDurationMinutes: number;
  /** Session plus the breaks around it: how far apart generated slots start. Rows follow it. */
  gridStepMinutes?: number;
  locations: PlaceOption[];
  initialSessions: SessionRow[];
};

type Granularity = "week" | "month";

export function AvailabilityView({
  timezone,
  initialWeekStart,
  defaultDurationMinutes,
  gridStepMinutes,
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
  const [adding, setAdding] = useState(false);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const isFirstRender = useRef(true);
  const [formError, setFormError] = useState<string | null>(null);

  const [today] = useState(() => formatInTimeZone(new Date(), timezone, "yyyy-MM-dd"));

  const weekStart = startOfWeekUtc(anchorDate);
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysUtc(startOfWeekUtc(anchorDate), i)),
    [anchorDate]
  );

  const holidays = useMemo(() => holidaysByDate(yearsBetween(weekDates[0], weekDates[6])), [weekDates]);

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
      .then((data: { sessions: { id: string; startsAt: string; endsAt: string; status: string; blockedNote?: string | null; booking: { clientNameSnapshot: string } | null; location: { id: string; color: string } }[] }) => {
        if (cancelled) return;
        setSessions(
          data.sessions.map((s) => ({
            id: s.id,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            status: s.status,
            clientName: s.booking?.clientNameSnapshot ?? null,
            blockedNote: s.blockedNote ?? null,
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


  /** Opens a slot where the therapist tapped empty time on the grid. */
  async function openSlotAt(
    dateKey: string,
    time: string,
    locationId: string | null,
    block?: { note: string },
    /** Typed in by hand (the add dialog); a tap on the calendar gets a session's length. */
    endTimeTyped?: string
  ): Promise<ActionResult> {
    const [hh, mm] = time.split(":").map(Number);
    const endMinutes = hh * 60 + mm + defaultDurationMinutes;
    const end = endTimeTyped ?? `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateKey,
          startTime: time,
          endTime: end,
          locationId: locationId ?? undefined,
          ...(block ? { status: "blocked", note: block.note.trim() || undefined } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error === "overlaps_existing" ? a.overlaps : data.error === "in_past" ? a.inPast : a.addError };
      }
      // Added for a day that is not on screen: go there, and the calendar loads it.
      if (dateKey < range.from || dateKey >= range.to) {
        setAnchorDate(granularity === "month" ? startOfMonthUtc(dateKey) : dateKey);
        return { ok: true };
      }
      setSessions((prev) => [
        ...prev,
        {
          id: data.session.id,
          startsAt: data.session.startsAt,
          endsAt: data.session.endsAt,
          status: data.session.status,
          clientName: null,
          blockedNote: data.session.blockedNote ?? null,
          locationId: data.session.location?.id ?? data.session.locationId,
          locationColor: data.session.location?.color ?? locations[0]?.color ?? "#000000",
        },
      ]);
      return { ok: true };
    } catch {
      return { ok: false, error: m.common.networkError };
    }
  }

  // The same three acts as on the home screen's schedule: block with a note, reopen, delete.
  async function patchSlot(sessionId: string, body: { status: "open" | "blocked"; note?: string }, failed: string): Promise<ActionResult> {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return { ok: false, error: failed };
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: body.status, blockedNote: body.status === "blocked" ? (body.note ?? null) : null } : s))
      );
      return { ok: true };
    } catch {
      return { ok: false, error: m.common.networkError };
    }
  }
  const blockSlot = (sessionId: string, note: string) =>
    patchSlot(sessionId, { status: "blocked", note: note.trim() || undefined }, m.dashboard.schedule.saveError);
  const reopenSlot = (sessionId: string) => patchSlot(sessionId, { status: "open" }, m.dashboard.schedule.reopenError);
  async function deleteSlot(sessionId: string): Promise<ActionResult> {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        return { ok: false, error: data?.error === "not_deletable" ? m.dashboard.schedule.deleteBooked : m.dashboard.schedule.deleteError };
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      return { ok: true };
    } catch {
      return { ok: false, error: m.common.networkError };
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
                : a.weekTitle(
                    // Isolated left-to-right: inside a Hebrew title the range otherwise reads backwards.
                    `\u2066${weekDates[0].slice(8, 10)}.${weekDates[0].slice(5, 7)}–${weekDates[6].slice(8, 10)}.${weekDates[6].slice(5, 7)}\u2069`
                  )}
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
          {/* Typing a slot in, for when finding its place on the calendar is the slow way. */}
          <Button type="button" className="self-center md:self-start" onClick={() => setAdding(true)}>
            {m.addSlot.button}
          </Button>
        </CardHeader>
        <CardContent>
          {formError && <p className="text-destructive mb-3 text-sm">{formError}</p>}
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
            // Drawn to scale: each slot as long as it lasts, the hours beside
            // the days and outside their sideways scroll. A phone sees about
            // three days at a time, starting on today.
            <div>
              <TimeGrid
                days={weekDates}
                today={today}
                timezone={timezone}
                items={sessions}
                hourHeight={56}
                minColumnWidth={96}
                scrollToToday
                dayHeader={(dateKey) => {
                  const dow = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
                  const holiday = holidays.get(dateKey);
                  return (
                    <>
                      <div className={cn("text-sm font-medium", dateKey === today && "text-primary")}>{m.labels.daysShort[dow]}</div>
                      <div className="num text-muted-foreground text-xs">
                        {dateKey.slice(8, 10)}.{dateKey.slice(5, 7)}
                      </div>
                      {holiday && (
                        <div className={cn("truncate text-[10px] leading-tight", holiday.kind === "observance" ? "text-muted-foreground" : "text-primary")}>
                          {m.holidays[holiday.key as keyof typeof m.holidays]}
                        </div>
                      )}
                    </>
                  );
                }}
                renderItem={(session: SessionRow, info: ItemInfo) => (
                  <SlotCell
                    session={session}
                    info={info}
                    onBlockSlot={blockSlot}
                    onReopenSlot={reopenSlot}
                    onDeleteSlot={deleteSlot}
                    showPlace={manyPlaces}
                  />
                )}
                empty={{
                  durationMinutes: defaultDurationMinutes,
                  bufferMinutes: Math.max(0, (gridStepMinutes ?? defaultDurationMinutes) - defaultDurationMinutes),
                  noRoomShort: m.dashboard.schedule.noRoomShort,
                  label: (dateKey) => m.dashboard.schedule.openSlotOnDay(`${dateKey.slice(8, 10)}.${dateKey.slice(5, 7)}`),
                  content: ({ dateKey, time, fits, close }) => (
                    <NewSlotForm
                      key={`${dateKey}T${time}`}
                      dateKey={dateKey}
                      time={time}
                      fits={fits}
                      locations={locations}
                      defaultLocationId={placeFilter}
                      onOpenSlot={openSlotAt}
                      onDone={close}
                    />
                  ),
                }}
              />
              <p className="text-muted-foreground mt-3 text-xs md:hidden">{a.scrollHint}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <AddSlotDialog
        open={adding}
        onClose={() => setAdding(false)}
        today={today}
        defaultDurationMinutes={defaultDurationMinutes}
        locations={locations}
        defaultLocationId={placeFilter}
        onAdd={(input) => openSlotAt(input.date, input.startTime, input.locationId, input.block, input.endTime)}
      />
    </div>
  );
}
