"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { formatInTimeZone } from "date-fns-tz";
import { he } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { addDaysUtc, addMonthsUtc, startOfMonthUtc, startOfWeekUtc, zonedDateTimeToUtc } from "@/lib/availability";
import { DAY_LABELS_SHORT, MONTH_LABELS } from "@/lib/labels";
import { sessionStatusTone, statusBadgeClass } from "@/lib/status-badge";

type SessionRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  clientName: string | null;
  clientPhone: string | null;
  blockedNote: string | null;
};

type RawSession = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  blockedNote?: string | null;
  booking: { clientNameSnapshot: string; clientPhoneSnapshot?: string | null } | null;
};

type ActionResult = { ok: true } | { ok: false; error: string };

type Granularity = "day" | "week" | "month";

const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: "יום",
  week: "שבוע",
  month: "חודש",
};

type Props = {
  timezone: string;
  today: string;
  defaultDurationMinutes: number;
  sessions: SessionRow[];
};

function addMinutesToTime(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor((total % (24 * 60)) / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function formatRangeLabel(granularity: Granularity, anchorDate: string) {
  if (granularity === "day") {
    const dow = new Date(`${anchorDate}T00:00:00Z`).getUTCDay();
    return `יום ${DAY_LABELS_SHORT[dow]} · ${anchorDate.slice(8, 10)}.${anchorDate.slice(5, 7)}`;
  }
  if (granularity === "month") {
    const [year, month] = anchorDate.split("-");
    return `${MONTH_LABELS[Number(month) - 1]} ${year}`;
  }
  const start = startOfWeekUtc(anchorDate);
  const end = addDaysUtc(start, 6);
  return `${start.slice(8, 10)}.${start.slice(5, 7)}–${end.slice(8, 10)}.${end.slice(5, 7)}`;
}

export function DashboardSchedule({
  timezone,
  today,
  defaultDurationMinutes,
  sessions: initialSessions,
}: Props) {
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [anchorDate, setAnchorDate] = useState(today);
  const [sessions, setSessions] = useState(initialSessions);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isFirstRender = useRef(true);

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
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setLoadError("שגיאה בטעינת הלו״ז, נסה שוב");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, timezone]);

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

  const columns = useMemo(
    () => (granularity === "day" ? [anchorDate] : Array.from({ length: 7 }, (_, i) => addDaysUtc(startOfWeekUtc(anchorDate), i))),
    [granularity, anchorDate]
  );

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
  function switchGranularity(g: Granularity) {
    setGranularity(g);
    setAnchorDate((d) => (g === "month" ? startOfMonthUtc(d) : d));
  }

  async function handleOpenSlot(dateKey: string, time: string): Promise<ActionResult> {
    const endTime = addMinutesToTime(time, defaultDurationMinutes);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateKey, startTime: time, endTime }),
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          ok: false,
          error:
            data.error === "overlaps_existing"
              ? "יש כבר חלון בזמן הזה"
              : data.error === "in_past"
                ? "לא ניתן לפתוח חלון בעבר"
                : "שגיאה בפתיחת החלון",
        };
      }
      setSessions((prev) => [
        ...prev,
        {
          id: data.session.id,
          startsAt: data.session.startsAt,
          endsAt: data.session.endsAt,
          status: data.session.status,
          clientName: null,
          clientPhone: null,
          blockedNote: null,
        },
      ]);
      return { ok: true };
    } catch {
      return { ok: false, error: "שגיאת רשת, נסה שוב" };
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
      if (!res.ok) return { ok: false, error: "שגיאה בשמירה" };
      const trimmed = note.trim() || null;
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: "blocked", blockedNote: trimmed } : s))
      );
      return { ok: true };
    } catch {
      return { ok: false, error: "שגיאת רשת, נסה שוב" };
    }
  }

  async function handleReopenSlot(sessionId: string): Promise<ActionResult> {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "open" }),
      });
      if (!res.ok) return { ok: false, error: "שגיאה בפתיחה מחדש" };
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: "open", blockedNote: null } : s))
      );
      return { ok: true };
    } catch {
      return { ok: false, error: "שגיאת רשת, נסה שוב" };
    }
  }

  return (
    <Card>
      {/* Every control row centers as a block on mobile and only splits to the
          edges from md up, so the narrow screen never shows a ragged edge. */}
      <CardHeader className="flex flex-col gap-3">
        <div className="flex flex-col items-center gap-3 md:flex-row md:justify-between">
          <CardTitle className="text-lg">הלו״ז שלי</CardTitle>
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
                תצוגת יומן
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                className={cn(
                  "min-h-11 rounded-sm px-3 text-sm font-medium transition-colors md:min-h-9",
                  view === "list" ? "bg-card shadow-xs" : "text-muted-foreground"
                )}
              >
                תצוגת רשימה
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
                {GRANULARITY_LABELS[g]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="num text-sm font-medium">{formatRangeLabel(granularity, anchorDate)}</span>
            <div className="flex gap-1">
              <Button type="button" variant="outline" size="sm" disabled={loading} onClick={goPrev} aria-label="התקופה הקודמת">
                ‹
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={loading || isCurrentPeriod} onClick={goToday}>
                היום
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={loading} onClick={goNext} aria-label="התקופה הבאה">
                ›
              </Button>
            </div>
          </div>
        </div>
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
          byDayAndTime.times.length === 0 && sessions.length === 0 ? (
            <EmptyCalendarHint granularity={granularity} />
          ) : (
            // Scrolling snaps to whole day columns (scroll-ps-12 clears the pinned
            // hour column) so a swipe never leaves a cell cut in half. Sticky cells
            // need border-separate — with border-collapse the row line is owned by
            // the table and tears when the pinned column scrolls over it.
            <div className="snap-x snap-mandatory scroll-ps-12 overflow-x-auto">
              <table
                className={cn(
                  "w-full border-separate border-spacing-0 text-sm",
                  granularity === "week" && "min-w-[620px]"
                )}
              >
                <thead>
                  <tr>
                    <th className="bg-card sticky start-0 z-10 w-12" />
                    {columns.map((dateKey) => {
                      const dow = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
                      const isToday = dateKey === today;
                      return (
                        <th key={dateKey} className="min-w-16 snap-start pb-2 text-center font-medium">
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
                    <tr key={time}>
                      <td className="num text-muted-foreground border-border bg-card sticky start-0 z-10 border-t py-2 pe-2 text-xs">
                        {time}
                      </td>
                      {columns.map((dateKey) => (
                        <td
                          key={dateKey}
                          className="border-border min-w-16 snap-start border-t p-1 text-center align-middle"
                        >
                          <SlotCell
                            session={byDayAndTime.map.get(`${dateKey}T${time}`)}
                            dateKey={dateKey}
                            time={time}
                            onOpenSlot={handleOpenSlot}
                            onBlockSlot={handleBlockSlot}
                            onReopenSlot={handleReopenSlot}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {granularity === "week" && (
                <p className="text-muted-foreground mt-3 text-xs md:hidden">גלול לצדדים לצפייה בכל ימות השבוע</p>
              )}
            </div>
          )
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

const STATUS_LABELS: Record<string, string> = {
  open: "פנוי",
  blocked: "חסום",
  booked: "מוזמן",
  held: "מוחזק זמנית",
};

function MonthGrid({
  anchorDate,
  today,
  sessions,
  timezone,
  onSelectDay,
}: {
  anchorDate: string;
  today: string;
  sessions: SessionRow[];
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

function SlotCell({
  session,
  dateKey,
  time,
  onOpenSlot,
  onBlockSlot,
  onReopenSlot,
}: {
  session: SessionRow | undefined;
  dateKey: string;
  time: string;
  onOpenSlot: (dateKey: string, time: string) => Promise<ActionResult>;
  onBlockSlot: (sessionId: string, note: string) => Promise<ActionResult>;
  onReopenSlot: (sessionId: string) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Empty cell: click opens a small popover to open a new window right here.
  if (!session) {
    return (
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={`פתח חלון טיפול ב-${time}`}
            className="border-muted-foreground/30 hover:border-primary hover:text-primary text-muted-foreground/50 flex min-h-11 w-full items-center justify-center rounded-md border border-dashed text-xs transition-colors md:min-h-9"
          >
            +
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={6}
            className="bg-card border-border z-50 w-52 rounded-md border p-3 text-start shadow-lg"
          >
            <p className="num text-sm font-medium">{time}</p>
            <p className="text-muted-foreground mb-2 text-xs">אין כאן חלון פתוח</p>
            {error && <p className="text-destructive mb-2 text-xs">{error}</p>}
            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const result = await onOpenSlot(dateKey, time);
                setBusy(false);
                if (result.ok) setOpen(false);
                else setError(result.error);
              }}
            >
              {busy ? "פותח..." : "פתח חלון טיפול"}
            </Button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  const isBookedOrHeld = session.status === "booked" || session.status === "held";
  const chipLabel =
    session.clientName ?? session.blockedNote ?? STATUS_LABELS[session.status] ?? session.status;
  const hoverDetails = isBookedOrHeld
    ? [session.clientName, session.clientPhone, time].filter(Boolean).join(" · ")
    : undefined;

  // Open (unbooked) slot: click offers to block it, optionally with a label.
  if (session.status === "open") {
    return (
      <SlotPopover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
        trigger={
          <button type="button" className={statusBadgeClass("open") + " w-full min-h-11 md:min-h-9 justify-center"}>
            {chipLabel}
          </button>
        }
      >
        <p className="num text-sm font-medium">{time} · פנוי</p>
        <p className="text-muted-foreground mb-2 text-xs">חלון טיפול פתוח, עדיין לא הוזמן</p>
        <NoteBlockForm
          initialNote=""
          busy={busy}
          error={error}
          submitLabel="חסום חלון"
          busyLabel="חוסם..."
          onSubmit={async (note) => {
            setBusy(true);
            setError(null);
            const result = await onBlockSlot(session.id, note);
            setBusy(false);
            if (result.ok) setOpen(false);
            else setError(result.error);
          }}
        />
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
          <button
            type="button"
            className={statusBadgeClass("blocked") + " w-full min-h-11 md:min-h-9 justify-center"}
          >
            {chipLabel}
          </button>
        }
      >
        <p className="num text-sm font-medium">{time} · חסום</p>
        <p className="text-muted-foreground mb-2 text-xs">אפשר להוסיף תווית, או לפתוח מחדש</p>
        <NoteBlockForm
          initialNote={session.blockedNote ?? ""}
          busy={busy}
          error={error}
          submitLabel="שמור"
          busyLabel="שומר..."
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
          פתח מחדש
        </Button>
      </SlotPopover>
    );
  }

  // Booked/held: read-only chip; hover reveals a bit more detail.
  return (
    <span
      title={hoverDetails}
      className={statusBadgeClass(sessionStatusTone(session.status)) + " w-full min-h-11 md:min-h-9 justify-center"}
    >
      {chipLabel}
    </span>
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
          className="bg-card border-border z-50 w-56 rounded-md border p-3 text-start shadow-lg"
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
  const [note, setNote] = useState(initialNote);

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="הערה (למשל שם המטופל)"
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

const EMPTY_HINT_LABEL: Record<Granularity, string> = {
  day: "היום",
  week: "השבוע",
  month: "החודש",
};

function EmptyCalendarHint({ granularity }: { granularity: Granularity }) {
  return (
    <p className="text-muted-foreground py-6 text-center text-sm">
      אין תורים או חלונות פתוחים {EMPTY_HINT_LABEL[granularity]} —{" "}
      <Link href="/dashboard/availability" className="text-primary underline underline-offset-2">
        פתחו חלון טיפול
      </Link>
    </p>
  );
}
