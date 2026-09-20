"use client";

import { useEffect, useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
// SVG icons, never the ‹ › punctuation: those are Unicode-mirrored characters,
// so an RTL run flips the glyph and the arrows end up pointing inward.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/dates";
import { addDaysUtc, addMonthsUtc, startOfMonthUtc, startOfWeekUtc } from "@/lib/availability";

type Slot = { id: string; startsAt: string; endsAt: string };
type DayAvailability = { date: string; slots: Slot[] };

type Props = {
  slug: string;
  timezone: string;
  durationMinutes: number;
  requirePhone: boolean;
  maxAdvanceDays: number;
  cancellationPolicyHours: number;
};

export function BookingFlow({ slug, timezone, requirePhone, maxAdvanceDays }: Props) {
  const { m, locale, dir } = useI18n();
  const b = m.book;
  const ERROR_MESSAGES: Record<string, string> = b.errors;
  const [step, setStep] = useState<"date" | "time" | "form" | "confirmed">("date");
  // Kept with the range it was fetched for, so switching months derives "still
  // loading" instead of clearing state inside the effect.
  const [fetched, setFetched] = useState<{ rangeKey: string; days: DayAvailability[] } | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [today] = useState(() => formatInTimeZone(new Date(), timezone, "yyyy-MM-dd"));
  const [monthAnchor, setMonthAnchor] = useState(() =>
    startOfMonthUtc(formatInTimeZone(new Date(), timezone, "yyyy-MM-dd"))
  );
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [manageToken, setManageToken] = useState<string | null>(null);

  const gridStart = startOfWeekUtc(monthAnchor);
  const gridDays = useMemo(
    () => Array.from({ length: 42 }, (_, i) => addDaysUtc(gridStart, i)),
    [gridStart]
  );

  const rangeKey = `${gridDays[0]}_${gridDays[gridDays.length - 1]}`;
  const days = fetched?.rangeKey === rangeKey ? fetched.days : null;

  // Fetch exactly the six-week window the calendar shows. The API clamps `to`
  // to the therapist's maxAdvanceDays on its own, so an over-long range is safe.
  useEffect(() => {
    let cancelled = false;
    const [from, to] = rangeKey.split("_");

    fetch(`/api/public/therapists/${slug}/availability?from=${from}&to=${to}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data) => {
        if (cancelled) return;
        setLoadError(false);
        setFetched({ rangeKey, days: data.days });
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, rangeKey]);

  useEffect(() => {
    if (!holdExpiresAt) return;
    const interval = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.floor((holdExpiresAt.getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [holdExpiresAt]);

  async function selectSlot(slot: Slot) {
    setFormError(null);
    const res = await fetch(`/api/public/sessions/${slot.id}/hold`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setFormError(ERROR_MESSAGES[data.error] ?? b.errors.slotGone);
      return;
    }
    setSelectedSlot(slot);
    setHoldExpiresAt(new Date(data.holdExpiresAt)); // the ticking effect below fills in secondsLeft
    setStep("form");
  }

  async function submitBooking() {
    if (!selectedSlot) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedSlot.id, fullName, phone, email, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(ERROR_MESSAGES[data.error] ?? m.common.genericError);
        if (data.error === "SLOT_ALREADY_BOOKED") {
          setStep("time");
          setSelectedSlot(null);
          setHoldExpiresAt(null);
        }
        return;
      }
      setManageToken(data.booking.manageToken);
      setStep("confirmed");
    } catch {
      setFormError(m.common.networkError);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return <p className="text-destructive text-center text-sm">{b.errors.loadTimes}</p>;
  }

  if (step === "confirmed" && selectedSlot) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <p className="text-3xl">✓</p>
          <p className="text-lg font-semibold">{b.confirmed}</p>
          <p>
            {fmt(selectedSlot.startsAt, timezone, locale, "weekdayDate")}
            <br />
            {fmt(selectedSlot.startsAt, timezone, locale, "time")}–{fmt(selectedSlot.endsAt, timezone, locale, "time")}
          </p>
          {manageToken && (
            <div className="flex flex-wrap items-center justify-center gap-4">
              <a
                href={`/api/public/bookings/manage/${manageToken}/ics`}
                className="text-primary text-sm underline underline-offset-4"
              >
                {b.addToCalendar}
              </a>
              <a
                href={`/book/${slug}/manage/${manageToken}`}
                className="text-primary text-sm underline underline-offset-4"
              >
                {b.changeOrCancel}
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (step === "form" && selectedSlot) {
    const expired = secondsLeft === 0;
    return (
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm">
            {fmt(selectedSlot.startsAt, timezone, locale, "weekdayDateShort")} ·{" "}
            {fmt(selectedSlot.startsAt, timezone, locale, "time")}–{fmt(selectedSlot.endsAt, timezone, locale, "time")}
          </p>
          {secondsLeft !== null && !expired && (
            <p className="text-muted-foreground text-xs">
              {b.heldFor(`${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`)}
            </p>
          )}
          {expired ? (
            <div className="flex flex-col gap-2">
              <p className="text-destructive text-sm">{b.holdExpired}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep("time");
                  setSelectedSlot(null);
                  setHoldExpiresAt(null);
                }}
              >
                {b.pickAnother}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="fullName">{b.fullName}</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">{b.phone}{requirePhone && " *"}</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">{b.email}</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="note">{b.note}</Label>
                <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
              </div>
              {formError && <p className="text-destructive text-sm">{formError}</p>}
              <Button
                type="button"
                disabled={
                  submitting ||
                  fullName.trim().length < 2 ||
                  !email.includes("@") ||
                  (requirePhone && phone.trim().length < 7)
                }
                onClick={submitBooking}
              >
                {submitting ? b.confirming : b.confirmBooking}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    );
  }


  if (step === "time" && selectedDate) {
    const day = days?.find((d) => d.date === selectedDate);
    return (
      <div className="flex flex-col gap-4">
        <Button type="button" variant="outline" size="sm" className="w-full sm:w-fit" onClick={() => setStep("date")}>
          {dir === "rtl" ? "→" : "←"} {b.pickAnotherDate}
        </Button>
        {formError && <p className="text-destructive text-sm">{formError}</p>}
        <div className="grid grid-cols-3 gap-2">
          {(day?.slots ?? []).map((slot) => (
            <Button key={slot.id} type="button" variant="outline" onClick={() => selectSlot(slot)}>
              {formatInTimeZone(new Date(slot.startsAt), timezone, "HH:mm")}
            </Button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">{b.timezoneNote}</p>
      </div>
    );
  }

  const slotsByDate = new Map((days ?? []).map((d) => [d.date, d.slots]));
  const currentMonth = monthAnchor.slice(0, 7);
  const thisMonth = startOfMonthUtc(today);
  const lastBookableMonth = startOfMonthUtc(addDaysUtc(today, maxAdvanceDays));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={currentMonth <= thisMonth.slice(0, 7)}
          onClick={() => setMonthAnchor((m) => addMonthsUtc(m, -1))}
          aria-label={b.prevMonth}
        >
          {dir === "rtl" ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </Button>
        <span className="text-sm font-medium">
          {m.labels.months[Number(monthAnchor.slice(5, 7)) - 1]} {monthAnchor.slice(0, 4)}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={currentMonth >= lastBookableMonth.slice(0, 7)}
          onClick={() => setMonthAnchor((m) => addMonthsUtc(m, 1))}
          aria-label={b.nextMonth}
        >
          {dir === "rtl" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
        </Button>
      </div>

      <div className="border-border bg-card rounded-lg border p-2">
        <div className="grid grid-cols-7 gap-1 text-center">
          {m.labels.daysShort.map((label) => (
            <div key={label} className="text-muted-foreground py-1 text-xs font-medium">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {gridDays.map((date) => {
            const slots = slotsByDate.get(date) ?? [];
            const inMonth = date.slice(0, 7) === currentMonth;
            const selectable = inMonth && slots.length > 0;
            return (
              <button
                key={date}
                type="button"
                disabled={!selectable}
                onClick={() => {
                  setSelectedDate(date);
                  setStep("time");
                }}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md border text-sm transition-colors",
                  selectable
                    ? "border-primary/30 hover:bg-accent hover:text-accent-foreground font-medium"
                    : "border-transparent text-muted-foreground/40",
                  !inMonth && "invisible",
                  date === today && selectable && "border-primary"
                )}
              >
                <span className="num">{date.slice(8, 10)}</span>
                {selectable && <span className="bg-primary size-1 rounded-full" aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>

      {!days ? (
        <p className="text-muted-foreground text-center text-xs">{b.loadingTimes}</p>
      ) : slotsByDate.size === 0 ? (
        <p className="text-muted-foreground text-center text-xs">{b.noTimesThisMonth}</p>
      ) : (
        <p className="text-muted-foreground text-center text-xs">{b.pickMarkedDay}</p>
      )}
    </div>
  );
}
