"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { formatInTimeZone } from "date-fns-tz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// SVG icons, never the ‹ › punctuation: those are Unicode-mirrored characters,
// so an RTL run flips the glyph and the arrows end up pointing inward.
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { addDaysUtc, addMonthsUtc, startOfMonthUtc, startOfWeekUtc, zonedDateTimeToUtc } from "@/lib/availability";
import { BookClientForm, MoveSlotForm, SLOTS_CHANGED_EVENT } from "./slot-actions";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/dates";
import type { Messages } from "@/i18n";
import { BlockLabel, TimeGrid, blockClass, type ItemInfo } from "@/components/time-grid";
import { ADD_SLOT_EVENT, AddSlotDialog } from "@/components/add-slot-dialog";
import { MonthGrid } from "@/components/month-grid";
import { sessionStatusTone, statusBadgeClass } from "@/lib/status-badge";
import { LocationDot, LocationFilter, LocationSelect, type PlaceOption } from "@/components/location-filter";
import { holidaysByDate, yearsBetween } from "@/lib/holidays";

type SessionRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  clientName: string | null;
  clientPhone?: string | null;
  blockedNote: string | null;
  /** The Cleana room this open slot came from. The therapist's eyes only. */
  cleanaRoom?: string | null;
  /** Its room at Cleana was cancelled under a booked client. */
  noRoom?: boolean;
  locationId: string;
  locationColor: string;
};

type RawSession = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  blockedNote?: string | null;
  cleanaRoom?: string | null;
  cleanaRoomCanceledAt?: string | null;
  booking: { clientNameSnapshot: string; clientPhoneSnapshot?: string | null } | null;
  location: { id: string; name: string; color: string };
};

export type ActionResult = { ok: true } | { ok: false; error: string };

type Granularity = "day" | "week" | "month";

type Props = {
  timezone: string;
  today: string;
  defaultDurationMinutes: number;
  /** Session plus the breaks around it: how far apart generated slots start. Rows follow it. */
  gridStepMinutes?: number;
  locations: PlaceOption[];
  sessions: SessionRow[];
};

function addMinutesToTime(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor((total % (24 * 60)) / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function formatRangeLabel(m: Messages, granularity: Granularity, anchorDate: string) {
  if (granularity === "day") {
    const dow = new Date(`${anchorDate}T00:00:00Z`).getUTCDay();
    return m.dashboard.schedule.dayLabel(m.labels.daysShort[dow], `${anchorDate.slice(8, 10)}.${anchorDate.slice(5, 7)}`);
  }
  if (granularity === "month") {
    const [year, month] = anchorDate.split("-");
    return `${m.labels.months[Number(month) - 1]} ${year}`;
  }
  const start = startOfWeekUtc(anchorDate);
  const end = addDaysUtc(start, 6);
  // Isolated left-to-right: inside a Hebrew line the range otherwise reads backwards (21.11–15.11).
  return `\u2066${start.slice(8, 10)}.${start.slice(5, 7)}–${end.slice(8, 10)}.${end.slice(5, 7)}\u2069`;
}

export function DashboardSchedule({
  timezone,
  today,
  defaultDurationMinutes,
  gridStepMinutes,
  locations,
  sessions: initialSessions,
}: Props) {
  const { m, locale, dir } = useI18n();
  const s = m.dashboard.schedule;
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [anchorDate, setAnchorDate] = useState(today);
  const [allSessions, setSessions] = useState(initialSessions);
  // One calendar, seen whole or one place at a time. The filter is a view; the
  // data underneath is always everything, so a slot opened while filtering to
  // Ramat Gan is still there when the filter comes off.
  const [placeFilter, setPlaceFilter] = useState<string | null>(null);
  const sessions = useMemo(
    () => (placeFilter ? allSessions.filter((session) => session.locationId === placeFilter) : allSessions),
    [allSessions, placeFilter]
  );
  const manyPlaces = locations.length > 1;
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Which day the phone layout is showing. The desktop grid shows all seven at
  // once; a phone cannot, and squeezing seven columns into 390px was what made
  // the week unreadable in the first place.
  const [selectedDay, setSelectedDay] = useState(today);
  const isFirstRender = useRef(true);
  // The "+ open a slot" button on the home screen is outside this card; it asks by event.
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const open = () => setAdding(true);
    window.addEventListener(ADD_SLOT_EVENT, open);
    return () => window.removeEventListener(ADD_SLOT_EVENT, open);
  }, []);

  // A slot was booked or moved from its popover: load the range again.
  const [reloadTick, setReloadTick] = useState(0);
  useEffect(() => {
    const bump = () => setReloadTick((n) => n + 1);
    window.addEventListener(SLOTS_CHANGED_EVENT, bump);
    return () => window.removeEventListener(SLOTS_CHANGED_EVENT, bump);
  }, []);

  const range = useMemo(() => {
    if (granularity === "day") return { from: anchorDate, to: addDaysUtc(anchorDate, 1) };
    if (granularity === "month") {
      const gridStart = startOfWeekUtc(startOfMonthUtc(anchorDate));
      return { from: gridStart, to: addDaysUtc(gridStart, 42) };
    }
    const weekStart = startOfWeekUtc(anchorDate);
    return { from: weekStart, to: addDaysUtc(weekStart, 7) };
  }, [granularity, anchorDate]);

  // The server already loaded the current week (matching the initial range) —
  // skip the redundant first fetch and only hit the API on actual navigation.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    const fromIso = zonedDateTimeToUtc(range.from, "00:00", timezone).toISOString();
    const toIso = zonedDateTimeToUtc(range.to, "00:00", timezone).toISOString();
    fetch(`/api/sessions?from=${fromIso}&to=${toIso}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: { sessions: RawSession[] }) => {
        if (cancelled) return;
        setSessions(
          data.sessions.map((s) => ({
            id: s.id,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            status: s.status,
            clientName: s.booking?.clientNameSnapshot ?? null,
            clientPhone: s.booking?.clientPhoneSnapshot ?? null,
            blockedNote: s.blockedNote ?? null,
            cleanaRoom: s.cleanaRoom ?? null,
            noRoom: !!s.cleanaRoomCanceledAt,
            locationId: s.location.id,
            locationColor: s.location.color,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setLoadError(s.loadError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, timezone, s.loadError, reloadTick]);

  const bookedOrOpen = useMemo(
    () => [...sessions].filter((s) => s.status === "booked" || s.status === "open").sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [sessions]
  );

  const columns = useMemo(
    () => (granularity === "day" ? [anchorDate] : Array.from({ length: 7 }, (_, i) => addDaysUtc(startOfWeekUtc(anchorDate), i))),
    [granularity, anchorDate]
  );
  const holidays = useMemo(() => holidaysByDate(yearsBetween(columns[0], columns[columns.length - 1])), [columns]);

  const isCurrentPeriod =
    granularity === "day"
      ? anchorDate === today
      : granularity === "month"
        ? startOfMonthUtc(anchorDate) === startOfMonthUtc(today)
        : startOfWeekUtc(anchorDate) === startOfWeekUtc(today);

  function goPrev() {
    setAnchorDate((d) =>
      granularity === "day" ? addDaysUtc(d, -1) : granularity === "month" ? addMonthsUtc(d, -1) : addDaysUtc(d, -7)
    );
  }
  function goNext() {
    setAnchorDate((d) =>
      granularity === "day" ? addDaysUtc(d, 1) : granularity === "month" ? addMonthsUtc(d, 1) : addDaysUtc(d, 7)
    );
  }
  function goToday() {
    setAnchorDate(granularity === "month" ? startOfMonthUtc(today) : today);
  }
  // Moving the week under the phone strip must move the selection with it, or
  // the list below keeps showing a day that is no longer on screen.
  const phoneDay = columns.includes(selectedDay) ? selectedDay : columns[0];

  function switchGranularity(g: Granularity) {
    setGranularity(g);
    setAnchorDate((d) => (g === "month" ? startOfMonthUtc(d) : d));
  }

  async function handleOpenSlot(
    dateKey: string,
    time: string,
    locationId: string | null,
    block?: { note: string },
    /** Typed in by hand (the add dialog); a tap on the calendar gets a session's length. */
    endTimeTyped?: string
  ): Promise<ActionResult> {
    const endTime = endTimeTyped ?? addMinutesToTime(time, defaultDurationMinutes);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateKey,
          startTime: time,
          endTime,
          locationId: locationId ?? undefined,
          ...(block ? { status: "blocked", note: block.note.trim() || undefined } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          ok: false,
          error:
            data.error === "overlaps_existing"
              ? s.overlaps
              : data.error === "in_past"
                ? s.inPast
                : s.openError,
        };
      }
      // Added for a day that is not on screen: go there, and the calendar loads it.
      if (dateKey < range.from || dateKey >= range.to) {
        setAnchorDate(granularity === "month" ? startOfMonthUtc(dateKey) : dateKey);
        setSelectedDay(dateKey);
        return { ok: true };
      }
      setSelectedDay(dateKey);
      setSessions((prev) => [
        ...prev,
        {
          id: data.session.id,
          startsAt: data.session.startsAt,
          endsAt: data.session.endsAt,
          status: data.session.status,
          clientName: null,
          clientPhone: null,
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

  // Blocks a slot (from open, or edits the note on an already-blocked one) with an
  // optional label — e.g. the name of someone booked outside the system.
  async function handleBlockSlot(sessionId: string, note: string): Promise<ActionResult> {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "blocked", note: note.trim() || undefined }),
      });
      if (!res.ok) return { ok: false, error: s.saveError };
      const trimmed = note.trim() || null;
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: "blocked", blockedNote: trimmed } : s))
      );
      return { ok: true };
    } catch {
      return { ok: false, error: m.common.networkError };
    }
  }

  /**
   * Removes an empty window entirely. Until now a slot could only be flipped
   * between open and blocked, so a calendar filled by a rule that was later
   * deleted could never be cleaned up.
   */
  async function handleDeleteSlot(sessionId: string): Promise<ActionResult> {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        return {
          ok: false,
          error:
            data?.error === "not_deletable"
              ? s.deleteBooked
              : s.deleteError,
        };
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      return { ok: true };
    } catch {
      return { ok: false, error: m.common.networkError };
    }
  }

  async function handleReopenSlot(sessionId: string): Promise<ActionResult> {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "open" }),
      });
      if (!res.ok) return { ok: false, error: s.reopenError };
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: "open", blockedNote: null } : s))
      );
      return { ok: true };
    } catch {
      return { ok: false, error: m.common.networkError };
    }
  }

  // A tap on empty time offers a slot moved past the session and break before it.
  const emptySlot = {
    durationMinutes: defaultDurationMinutes,
    bufferMinutes: Math.max(0, (gridStepMinutes ?? defaultDurationMinutes) - defaultDurationMinutes),
    label: (dateKey: string) => s.openSlotOnDay(`${dateKey.slice(8, 10)}.${dateKey.slice(5, 7)}`),
    content: ({ dateKey, time, fits, close }: { dateKey: string; time: string; fits: boolean; close: () => void }) => (
      <NewSlotForm
        key={`${dateKey}T${time}`}
        dateKey={dateKey}
        time={time}
        fits={fits}
        locations={locations}
        defaultLocationId={placeFilter}
        onOpenSlot={handleOpenSlot}
        onDone={close}
      />
    ),
  };
  const renderSession = (session: SessionRow, info: ItemInfo) => (
    <SlotCell
      session={session}
      info={info}
      onBlockSlot={handleBlockSlot}
      onReopenSlot={handleReopenSlot}
      onDeleteSlot={handleDeleteSlot}
      showPlace={manyPlaces}
      timezone={timezone}
    />
  );
  const dayHeader = (dateKey: string) => {
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
  };

  return (
    <Card>
      {/* Every control row centers as a block on mobile and only splits to the
          edges from md up. items-stretch is load-bearing here: CardHeader ships
          items-start, which shrink-wraps each row to its widest child and pins it
          to the inline-start edge — the rows then centre inside that narrow box
          instead of on the card. */}
      <CardHeader className="flex flex-col items-stretch gap-3">
        <div className="flex flex-col items-center gap-3 md:flex-row md:justify-between">
          <CardTitle className="text-lg">{s.title}</CardTitle>
          {granularity !== "month" && (
            <div className="bg-muted inline-flex gap-1 rounded-md p-1">
              <button
                type="button"
                onClick={() => setView("calendar")}
                className={cn(
                  "min-h-11 rounded-sm px-3 text-sm font-medium transition-colors md:min-h-9",
                  view === "calendar" ? "bg-card shadow-xs" : "text-muted-foreground"
                )}
              >
                {s.calendarView}
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                className={cn(
                  "min-h-11 rounded-sm px-3 text-sm font-medium transition-colors md:min-h-9",
                  view === "list" ? "bg-card shadow-xs" : "text-muted-foreground"
                )}
              >
                {s.listView}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-2 md:flex-row md:justify-between">
          <div className="bg-muted inline-flex gap-1 rounded-md p-1">
            {(["day", "week", "month"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => switchGranularity(g)}
                className={cn(
                  "min-h-11 rounded-sm px-3 text-sm font-medium transition-colors md:min-h-9",
                  granularity === g ? "bg-card shadow-xs" : "text-muted-foreground"
                )}
              >
                {s.granularity[g]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="num text-sm font-medium">{formatRangeLabel(m, granularity, anchorDate)}</span>
            <div className="flex gap-1">
              <Button type="button" variant="outline" size="sm" disabled={loading} onClick={goPrev} aria-label={s.prevPeriod}>
                {dir === "rtl" ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={loading || isCurrentPeriod} onClick={goToday}>
                {s.today}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={loading} onClick={goNext} aria-label={s.nextPeriod}>
                {dir === "rtl" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
              </Button>
            </div>
          </div>
        </div>
        <LocationFilter locations={locations} value={placeFilter} onChange={setPlaceFilter} />
        <AddSlotDialog
          open={adding}
          onClose={() => setAdding(false)}
          today={today}
          defaultDurationMinutes={defaultDurationMinutes}
          locations={locations}
          defaultLocationId={placeFilter}
          onAdd={(input) => handleOpenSlot(input.date, input.startTime, input.locationId, input.block, input.endTime)}
        />
      </CardHeader>
      <CardContent>
        {loadError && <p className="text-destructive mb-3 text-sm">{loadError}</p>}
        {granularity === "month" ? (
          <MonthGrid
            anchorDate={anchorDate}
            today={today}
            sessions={sessions}
            timezone={timezone}
            onSelectDay={(date) => {
              setAnchorDate(date);
              setGranularity("day");
            }}
          />
        ) : view === "calendar" ? (
          <>
            {/* Phone: pick a day, then read that day. A seven-column grid at
                390px gives each day ~50px, which wraps a client's name to one
                glyph per line — so the week is a strip of chips instead, and
                every day is one tap away rather than a sideways scroll. */}
            {granularity === "week" && (
              <div className="flex flex-col gap-4 md:hidden">
                <div className="grid grid-cols-7 gap-1">
                  {columns.map((dateKey) => {
                    const dow = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
                    const count = sessions.filter(
                      (session) =>
                        formatInTimeZone(new Date(session.startsAt), timezone, "yyyy-MM-dd") ===
                          dateKey && session.status === "booked"
                    ).length;
                    return (
                      <button
                        key={dateKey}
                        type="button"
                        onClick={() => setSelectedDay(dateKey)}
                        className={cn(
                          "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg border transition-colors",
                          phoneDay === dateKey
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:bg-secondary"
                        )}
                      >
                        <span className="text-[11px] leading-none font-medium">
                          {m.labels.daysShort[dow]}
                        </span>
                        <span className="num text-xs leading-none">{dateKey.slice(8, 10)}</span>
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            count > 0
                              ? phoneDay === dateKey
                                ? "bg-primary-foreground"
                                : "bg-st-booked"
                              : "bg-transparent"
                          )}
                        />
                      </button>
                    );
                  })}
                </div>

                <TimeGrid
                  days={[phoneDay]}
                  today={today}
                  timezone={timezone}
                  items={sessions}
                  hourHeight={64}
                  renderItem={renderSession}
                  empty={emptySlot}
                />
              </div>
            )}

            {/* Desktop, and the single day on any screen: the days side by side,
                drawn to scale. Below 7 × 120px the week scrolls sideways; the
                hours stay put beside it. */}
            <div className={cn(granularity === "week" && "hidden md:block")}>
              <TimeGrid
                days={columns}
                today={today}
                timezone={timezone}
                items={sessions}
                hourHeight={56}
                minColumnWidth={granularity === "week" ? 120 : 0}
                dayHeader={dayHeader}
                renderItem={renderSession}
                empty={emptySlot}
              />
            </div>
          </>
        ) : bookedOrOpen.length === 0 ? (
          <EmptyCalendarHint granularity={granularity} />
        ) : (
          <ul className="flex flex-col gap-2">
            {bookedOrOpen.map((session) => (
              <li
                key={session.id}
                className="border-border flex min-h-11 flex-col items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm md:flex-row md:justify-between md:gap-2"
              >
                <span className="num text-muted-foreground">
                  {fmt(session.startsAt, timezone, locale, "weekdayDateShort")} ·{" "}
                  {fmt(session.startsAt, timezone, locale, "time")}
                </span>
                <span className={statusBadgeClass(sessionStatusTone(session.status))}>
                  {manyPlaces && <LocationDot color={session.locationColor} />}
                  {session.clientName ?? s.status.open}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** A tap on empty time: open a slot there, at the place asked. */
export function NewSlotForm({
  dateKey,
  time,
  fits,
  locations,
  defaultLocationId,
  onOpenSlot,
  onDone,
}: {
  dateKey: string;
  time: string;
  fits: boolean;
  locations: PlaceOption[];
  defaultLocationId: string | null;
  onOpenSlot: (dateKey: string, time: string, locationId: string | null, block?: { note: string }) => Promise<ActionResult>;
  onDone: () => void;
}) {
  const { m } = useI18n();
  const s = m.dashboard.schedule;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState(defaultLocationId ?? locations[0]?.id ?? "");
  return (
    <>
      <p className="num text-sm font-medium" dir="ltr">
        {time}
      </p>
      {fits ? (
        <>
          <p className="text-muted-foreground mb-2 text-xs">{s.noSlotHere}</p>
          <div className="mb-2">
            <LocationSelect id={`place-${dateKey}-${time}`} locations={locations} value={placeId} onChange={setPlaceId} label={m.locations.where} />
          </div>
          {error && <p className="text-destructive mb-2 text-xs">{error}</p>}
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const result = await onOpenSlot(dateKey, time, locations.length > 1 ? placeId : null);
              setBusy(false);
              if (result.ok) onDone();
              else setError(result.error);
            }}
          >
            {busy ? s.opening : s.openSlot}
          </Button>
          {/* Or the opposite: time the therapist is busy, set aside with a word on why. */}
          <div className="border-border mt-3 flex flex-col gap-2 border-t pt-3">
            <p className="text-muted-foreground text-xs">{s.blockHere}</p>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={s.blockNotePlaceholder}
              aria-label={s.blockNotePlaceholder}
              maxLength={80}
              className="h-9 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const result = await onOpenSlot(dateKey, time, locations.length > 1 ? placeId : null, { note });
                setBusy(false);
                if (result.ok) onDone();
                else setError(result.error);
              }}
            >
              {busy ? s.blocking : s.block}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-xs">{s.noRoom}</p>
      )}
    </>
  );
}

export function SlotCell({
  session,
  info,
  onBlockSlot,
  onReopenSlot,
  onDeleteSlot,
  showPlace,
  timezone = "Asia/Jerusalem",
}: {
  session: SessionRow;
  info: ItemInfo;
  /** The therapist's timezone: which calendar day the slot is on, for changing its time. */
  timezone?: string;
  onBlockSlot: (sessionId: string, note: string) => Promise<ActionResult>;
  onReopenSlot: (sessionId: string) => Promise<ActionResult>;
  onDeleteSlot: (sessionId: string) => Promise<ActionResult>;
  showPlace: boolean;
}) {
  const { m } = useI18n();
  const s = m.dashboard.schedule;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What the popover is showing: the list of actions, or one of them.
  const [mode, setMode] = useState<"menu" | "book" | "move" | "block">("menu");
  const time = `${info.start}–${info.end}`;
  const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(session.startsAt)
  );
  const fromCleana = !!session.cleanaRoom;
  const close = () => {
    setOpen(false);
    setMode("menu");
    setError(null);
  };
  const backButton = (
    <Button type="button" variant="ghost" size="sm" className="mt-1 w-full" onClick={() => setMode("menu")}>
      {s.back}
    </Button>
  );

  const isBookedOrHeld = session.status === "booked" || session.status === "held";
  const statusLabel = s.status[session.status as keyof typeof s.status] ?? session.status;
  const chipLabel =
    (session.noRoom && session.clientName ? `⚠ ${m.cleanaLink.noRoom} · ${session.clientName}` : null) ??
    session.clientName ??
    session.blockedNote ??
    (session.status === "open" && session.cleanaRoom ? m.cleanaLink.slotLabel(statusLabel, session.cleanaRoom) : statusLabel);
  const hoverDetails = isBookedOrHeld
    ? [session.clientName, session.clientPhone, `${info.start}–${info.end}`].filter(Boolean).join(" · ")
    : undefined;
  const label = (
    <BlockLabel title={chipLabel} info={info} place={showPlace ? <LocationDot color={session.locationColor} /> : undefined} />
  );

  // Open (unbooked) slot: click offers to block it, optionally with a label.
  if (session.status === "open") {
    return (
      <SlotPopover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setError(null);
            setMode("menu");
          }
        }}
        trigger={
          <button type="button" className={blockClass("open")}>
            {label}
          </button>
        }
      >
        <p className="text-sm font-medium">
          <span dir="ltr" className="num">{time}</span> · {s.status.open}
        </p>
        <p className="text-muted-foreground mb-2 text-xs">
          {fromCleana ? m.cleanaLink.slotSub(session.cleanaRoom!) : s.openSlotHint}
        </p>
        {mode === "menu" && (
          <div className="flex flex-col gap-1.5">
            <Button type="button" size="sm" className="w-full" onClick={() => setMode("book")}>
              {s.bookClient}
            </Button>
            {fromCleana ? (
              <p className="text-muted-foreground text-xs">{s.fromCleanaHint}</p>
            ) : (
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setMode("move")}>
                {s.changeTime}
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setMode("block")}>
              {s.blockTitle}
            </Button>
            <DeleteSlotButton
              busy={busy}
              onDelete={async () => {
                setBusy(true);
                setError(null);
                const result = await onDeleteSlot(session.id);
                setBusy(false);
                if (result.ok) close();
                else setError(result.error);
              }}
            />
            {error && <p className="text-destructive text-xs">{error}</p>}
          </div>
        )}
        {mode === "book" && (
          <>
            <BookClientForm sessionId={session.id} onDone={close} />
            {backButton}
          </>
        )}
        {mode === "move" && (
          <>
            <MoveSlotForm sessionId={session.id} date={dateKey} start={info.start} end={info.end} onDone={close} />
            {backButton}
          </>
        )}
        {mode === "block" && (
          <>
            <NoteBlockForm
              initialNote=""
              busy={busy}
              error={error}
              submitLabel={s.block}
              busyLabel={s.blocking}
              onSubmit={async (note) => {
                setBusy(true);
                setError(null);
                const result = await onBlockSlot(session.id, note);
                setBusy(false);
                if (result.ok) close();
                else setError(result.error);
              }}
            />
            {backButton}
          </>
        )}
      </SlotPopover>
    );
  }

  // Blocked slot: click lets you edit its label or reopen it as available.
  if (session.status === "blocked") {
    return (
      <SlotPopover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
        trigger={
          <button type="button" className={blockClass("blocked")}>
            {label}
          </button>
        }
      >
        <p className="text-sm font-medium">
          <span dir="ltr" className="num">{time}</span> · {s.status.blocked}
        </p>
        <p className="text-muted-foreground mb-2 text-xs">{s.blockedSlotHint}</p>
        {mode === "move" && (
          <div className="mb-2">
            <MoveSlotForm sessionId={session.id} date={dateKey} start={info.start} end={info.end} onDone={close} />
            {backButton}
          </div>
        )}
        <NoteBlockForm
          initialNote={session.blockedNote ?? ""}
          busy={busy}
          error={error}
          submitLabel={s.saveNote}
          busyLabel={s.saving}
          onSubmit={async (note) => {
            setBusy(true);
            setError(null);
            const result = await onBlockSlot(session.id, note);
            setBusy(false);
            if (result.ok) setOpen(false);
            else setError(result.error);
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const result = await onReopenSlot(session.id);
            setBusy(false);
            if (result.ok) setOpen(false);
            else setError(result.error);
          }}
        >
          {s.reopen}
        </Button>
        {!fromCleana && mode !== "move" && (
          <Button type="button" variant="ghost" size="sm" className="mt-1 w-full" disabled={busy} onClick={() => setMode("move")}>
            {s.changeTime}
          </Button>
        )}
        <DeleteSlotButton
          busy={busy}
          onDelete={async () => {
            setBusy(true);
            setError(null);
            const result = await onDeleteSlot(session.id);
            setBusy(false);
            if (result.ok) setOpen(false);
            else setError(result.error);
          }}
        />
      </SlotPopover>
    );
  }

  // Held: a client is mid-booking; nothing to do but wait.
  if (session.status !== "booked") {
    return (
      <div title={hoverDetails} className={blockClass(sessionStatusTone(session.status))}>
        {label}
      </div>
    );
  }

  // Booked: who and when, and the way to the booking itself (cancel, payment, reminder).
  return (
    <SlotPopover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type="button" title={hoverDetails} className={blockClass(sessionStatusTone(session.status))}>
          {label}
        </button>
      }
    >
      <p className="text-sm font-medium">
        <span dir="ltr" className="num">{time}</span> · {s.status.booked}
      </p>
      <p className="mt-1 text-sm">{session.clientName}</p>
      {session.clientPhone && (
        <a href={`tel:${session.clientPhone}`} dir="ltr" className="num text-muted-foreground block text-sm underline">
          {session.clientPhone}
        </a>
      )}
      {session.noRoom && <p className="text-destructive mt-1 text-xs">⚠ {m.cleanaLink.noRoom} · {m.cleanaLink.noRoomNote}</p>}
      <Button asChild variant="outline" size="sm" className="mt-2 w-full">
        <a href="/dashboard/bookings">{s.manageBooking}</a>
      </Button>
    </SlotPopover>
  );
}

/**
 * Two-step on purpose: deleting a window is instant and irreversible, and these
 * sit inside a dense grid where the wrong cell is one pixel away.
 */
function DeleteSlotButton({ busy, onDelete }: { busy: boolean; onDelete: () => void }) {
  const { m } = useI18n();
  const s = m.dashboard.schedule;
  const [confirming, setConfirming] = useState(false);

  // Set apart from the edit above it: removing an hour is a different act
  // from labelling it, and should not sit in the same row of buttons.
  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive border-border mt-3 w-full rounded-none border-t pt-3"
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-4" />
        {s.delete}
      </Button>
    );
  }

  return (
    <div className="border-border mt-3 flex flex-col gap-1 border-t pt-3">
      <p className="text-sm font-medium">{s.deleteQuestion}</p>
      <div className="flex gap-1">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="flex-1"
          disabled={busy}
          onClick={onDelete}
        >
          {busy ? s.deleting : s.yesDelete}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => setConfirming(false)}
        >
          {m.common.cancel}
        </Button>
      </div>
    </div>
  );
}

function SlotPopover({
  open,
  onOpenChange,
  trigger,
  children,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          className="bg-card border-border z-50 w-72 max-w-[calc(100vw-1.5rem)] rounded-md border p-3 text-start shadow-lg"
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function NoteBlockForm({
  initialNote,
  busy,
  error,
  submitLabel,
  busyLabel,
  onSubmit,
}: {
  initialNote: string;
  busy: boolean;
  error: string | null;
  submitLabel: string;
  busyLabel: string;
  onSubmit: (note: string) => void;
}) {
  const { m } = useI18n();
  const [note, setNote] = useState(initialNote);

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={m.dashboard.schedule.blockNotePlaceholder}
        maxLength={80}
        className="h-9 text-sm"
      />
      {error && <p className="text-destructive text-xs">{error}</p>}
      <Button type="button" size="sm" className="w-full" disabled={busy} onClick={() => onSubmit(note)}>
        {busy ? busyLabel : submitLabel}
      </Button>
    </div>
  );
}

function EmptyCalendarHint({ granularity }: { granularity: Granularity }) {
  const { m } = useI18n();
  const s = m.dashboard.schedule;
  return (
    <p className="text-muted-foreground py-6 text-center text-sm">
      {granularity === "day" ? s.emptyDay : s.emptyWeek}{" "}
      <Link href="/dashboard/availability" className="text-primary underline underline-offset-2">
        {s.emptyRules}
      </Link>
    </p>
  );
}
