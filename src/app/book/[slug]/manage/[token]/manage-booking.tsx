"use client";

import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/dates";

type Props = {
  token: string;
  slug: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  status: string;
  therapistFullName: string;
  therapistPhone: string | null;
  /** The place this appointment is at. A reschedule stays there. */
  placeSlug: string;
  placeLabel: string | null;
  withinPolicyWindow: boolean;
  /** Where to pay, when the therapist takes payment online and this one is unpaid. */
  paymentUrl: string | null;
  paymentAmount: string | null;
  paid: boolean;
  /** Came back from the provider's success page just now. */
  justPaid: boolean;
};

type Slot = { id: string; startsAt: string; endsAt: string };
type DayAvailability = { date: string; slots: Slot[] };

const CANCELED_STATUSES = ["canceled_by_client", "canceled_by_therapist"];

export function ManageBooking({
  token,
  slug,
  timezone,
  startsAt: initialStartsAt,
  endsAt: initialEndsAt,
  status: initialStatus,
  therapistFullName,
  therapistPhone,
  placeSlug,
  placeLabel,
  withinPolicyWindow,
  paymentUrl,
  paymentAmount,
  paid,
  justPaid,
}: Props) {
  const { m, locale, dir } = useI18n();
  const g = m.manage;
  const [startsAt, setStartsAt] = useState(initialStartsAt);
  const [endsAt, setEndsAt] = useState(initialEndsAt);
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);

  const [mode, setMode] = useState<"view" | "reschedule">("view");
  const [days, setDays] = useState<DayAvailability[] | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [submittingSlot, setSubmittingSlot] = useState<string | null>(null);

  const isCanceled = CANCELED_STATUSES.includes(status);

  async function handleCancel() {
    setError(null);
    setCanceling(true);
    try {
      const res = await fetch(`/api/public/bookings/manage/${token}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "CANCELLATION_WINDOW_PASSED" ? g.cancelWindowPassed : m.common.genericError
        );
        return;
      }
      setStatus("canceled_by_client");
    } catch {
      setError(m.common.networkError);
    } finally {
      setCanceling(false);
    }
  }

  async function startReschedule() {
    setError(null);
    setMode("reschedule");
    if (days) return;
    try {
      const from = new Date();
      const to = new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
      const fmt = (d: Date) => formatInTimeZone(d, timezone, "yyyy-MM-dd");
      const res = await fetch(
        `/api/public/therapists/${slug}/availability?from=${fmt(from)}&to=${fmt(to)}&location=${encodeURIComponent(placeSlug)}`
      );
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setDays(data.days);
    } catch {
      setError(g.loadError);
    }
  }

  async function confirmReschedule(sessionId: string) {
    setError(null);
    setSubmittingSlot(sessionId);
    try {
      const res = await fetch(`/api/public/bookings/manage/${token}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "SLOT_ALREADY_BOOKED"
            ? g.slotTaken
            : data.error === "CANCELLATION_WINDOW_PASSED"
              ? g.rescheduleWindowPassed
              : m.common.genericError
        );
        return;
      }
      setStartsAt(data.startsAt);
      setEndsAt(data.endsAt);
      setMode("view");
      setSelectedDate(null);
    } catch {
      setError(m.common.networkError);
    } finally {
      setSubmittingSlot(null);
    }
  }

  if (mode === "reschedule") {
    const availableDates = days?.filter((d) => d.slots.length > 0) ?? [];
    const day = selectedDate ? days?.find((d) => d.date === selectedDate) : undefined;

    return (
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="text-lg font-semibold">{g.pickNewTime}</p>
          {error && <p className="text-destructive text-sm">{error}</p>}
          {!days ? (
            <p className="text-muted-foreground text-sm">{g.loadingTimes}</p>
          ) : day ? (
            <>
              <Button type="button" variant="outline" size="sm" className="w-full sm:w-fit" onClick={() => setSelectedDate(null)}>
                {dir === "rtl" ? "→" : "←"} {g.pickAnotherDate}
              </Button>
              <div className="grid grid-cols-3 gap-2">
                {day.slots.map((slot) => (
                  <Button
                    key={slot.id}
                    type="button"
                    variant="outline"
                    disabled={submittingSlot !== null}
                    onClick={() => confirmReschedule(slot.id)}
                  >
                    {submittingSlot === slot.id
                      ? "..."
                      : formatInTimeZone(new Date(slot.startsAt), timezone, "HH:mm")}
                  </Button>
                ))}
              </div>
            </>
          ) : availableDates.length === 0 ? (
            <p className="text-muted-foreground text-sm">{g.noTimesSoon}</p>
          ) : (
            <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2">
              {days.map((d) => {
                const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay();
                const available = d.slots.length > 0;
                return (
                  <button
                    key={d.date}
                    type="button"
                    disabled={!available}
                    onClick={() => setSelectedDate(d.date)}
                    className="flex min-h-11 min-w-16 snap-start flex-col items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:text-muted-foreground disabled:opacity-40"
                  >
                    <span>{m.labels.daysShort[dow]}</span>
                    <span className="num font-semibold">{d.date.slice(8, 10)}</span>
                  </button>
                );
              })}
            </div>
          )}
          <Button type="button" variant="ghost" size="sm" className="w-full sm:w-fit" onClick={() => setMode("view")}>
            {m.common.cancel}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-lg font-semibold">{g.yourAppointmentWith(therapistFullName)}</p>
        <p>
          {fmt(startsAt, timezone, locale, "weekdayDate")}
          <br />
          {fmt(startsAt, timezone, locale, "time")}–{fmt(endsAt, timezone, locale, "time")}
        </p>
        {placeLabel && <p className="text-muted-foreground text-sm">📍 {placeLabel}</p>}

        {!isCanceled && (
          <a
            href={`/api/public/bookings/manage/${token}/ics`}
            className="text-primary inline-flex min-h-11 items-center justify-center text-sm underline underline-offset-4 md:min-h-0 md:w-fit"
          >
            {g.addToCalendar}
          </a>
        )}

        {!isCanceled && (paid || justPaid) && (
          <p className="text-st-open text-sm font-medium">{justPaid && !paid ? g.paidThanks : g.paid}</p>
        )}

        {!isCanceled && !paid && !justPaid && paymentUrl && (
          <Button asChild size="lg" className="w-full md:w-fit">
            <a href={paymentUrl} target="_blank" rel="noreferrer noopener">
              {paymentAmount ? g.payNowAmount(paymentAmount) : g.payNow}
            </a>
          </Button>
        )}

        {isCanceled ? (
          <p className="text-muted-foreground text-sm">{g.canceled}</p>
        ) : withinPolicyWindow ? (
          <p className="text-muted-foreground text-sm">
            {g.windowPassed}
            {therapistPhone && ` ${g.contact(therapistFullName, therapistPhone)}`}
          </p>
        ) : (
          <>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <div className="flex flex-wrap justify-center gap-2 md:justify-start">
              <Button type="button" variant="outline" onClick={startReschedule}>
                {g.reschedule}
              </Button>
              <Button type="button" variant="destructive" disabled={canceling} onClick={handleCancel}>
                {canceling ? g.canceling : g.cancel}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
