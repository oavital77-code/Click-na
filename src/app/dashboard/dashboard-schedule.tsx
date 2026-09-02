"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { formatInTimeZone } from "date-fns-tz";
import { he } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DAY_LABELS_SHORT } from "@/lib/labels";
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

type ActionResult = { ok: true } | { ok: false; error: string };

type Props = {
  timezone: string;
  weekDates: string[]; // 7 dates, Sunday..Saturday, yyyy-MM-dd
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

export function DashboardSchedule({ timezone, weekDates, today, defaultDurationMinutes, sessions: initialSessions }: Props) {
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [sessions, setSessions] = useState(initialSessions);

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
          byDayAndTime.times.length === 0 && sessions.length === 0 ? (
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
                      {weekDates.map((dateKey, i) => (
                        <td key={dateKey} className={cn("p-1 text-center align-middle", i >= 3 && "hidden md:table-cell")}>
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

const STATUS_LABELS: Record<string, string> = {
  open: "פנוי",
  blocked: "חסום",
  booked: "מוזמן",
  held: "מוחזק זמנית",
};

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
            className="border-muted-foreground/30 hover:border-primary hover:text-primary text-muted-foreground/50 flex min-h-9 w-full items-center justify-center rounded-md border border-dashed text-xs transition-colors"
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
          <button type="button" className={statusBadgeClass("open") + " w-full min-h-9 justify-center"}>
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
            className={statusBadgeClass("blocked") + " w-full min-h-9 justify-center"}
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
      className={statusBadgeClass(sessionStatusTone(session.status)) + " w-full min-h-9 justify-center"}
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
