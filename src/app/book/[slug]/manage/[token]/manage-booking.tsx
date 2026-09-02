"use client";

import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { he } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DAY_LABELS_SHORT } from "@/lib/labels";

type Props = {
  token: string;
  slug: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  status: string;
  therapistFullName: string;
  therapistPhone: string | null;
  withinPolicyWindow: boolean;
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
  withinPolicyWindow,
}: Props) {
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
          data.error === "CANCELLATION_WINDOW_PASSED"
            ? "לא ניתן לבטל אונליין בטווח זה."
            : "אירעה שגיאה, נסה שוב"
        );
        return;
      }
      setStatus("canceled_by_client");
    } catch {
      setError("שגיאת רשת, נסה שוב");
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
        `/api/public/therapists/${slug}/availability?from=${fmt(from)}&to=${fmt(to)}`
      );
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setDays(data.days);
    } catch {
      setError("שגיאה בטעינת זמנים פנויים, נסה שוב");
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
            ? "המועד הזה כבר נתפס, בחר מועד אחר"
            : data.error === "CANCELLATION_WINDOW_PASSED"
              ? "לא ניתן לשנות מועד אונליין בטווח זה."
              : "אירעה שגיאה, נסה שוב"
        );
        return;
      }
      setStartsAt(data.startsAt);
      setEndsAt(data.endsAt);
      setMode("view");
      setSelectedDate(null);
    } catch {
      setError("שגיאת רשת, נסה שוב");
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
          <p className="text-lg font-semibold">בחר/י מועד חדש</p>
          {error && <p className="text-destructive text-sm">{error}</p>}
          {!days ? (
            <p className="text-muted-foreground text-sm">טוען זמנים פנויים...</p>
          ) : day ? (
            <>
              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setSelectedDate(null)}>
                → בחר תאריך אחר
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
            <p className="text-muted-foreground text-sm">אין זמנים פנויים בקרוב</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {days.map((d) => {
                const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay();
                const available = d.slots.length > 0;
                return (
                  <button
                    key={d.date}
                    type="button"
                    disabled={!available}
                    onClick={() => setSelectedDate(d.date)}
                    className="flex min-h-11 min-w-16 flex-col items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:text-muted-foreground disabled:opacity-40"
                  >
                    <span>{DAY_LABELS_SHORT[dow]}</span>
                    <span className="num font-semibold">{d.date.slice(8, 10)}</span>
                  </button>
                );
              })}
            </div>
          )}
          <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setMode("view")}>
            ביטול
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-lg font-semibold">התור שלך אצל {therapistFullName}</p>
        <p>
          {formatInTimeZone(new Date(startsAt), timezone, "EEEE, d.M.yyyy", { locale: he })}
          <br />
          {formatInTimeZone(new Date(startsAt), timezone, "HH:mm")}–
          {formatInTimeZone(new Date(endsAt), timezone, "HH:mm")}
        </p>

        {!isCanceled && (
          <a
            href={`/api/public/bookings/manage/${token}/ics`}
            className="text-primary w-fit text-sm underline underline-offset-4"
          >
            הוסף ליומן
          </a>
        )}

        {isCanceled ? (
          <p className="text-muted-foreground text-sm">התור בוטל.</p>
        ) : withinPolicyWindow ? (
          <p className="text-muted-foreground text-sm">
            לא ניתן לבטל או לשנות מועד אונליין בטווח זה.
            {therapistPhone && ` צור קשר עם ${therapistFullName}: ${therapistPhone}`}
          </p>
        ) : (
          <>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={startReschedule}>
                שנה מועד
              </Button>
              <Button type="button" variant="destructive" disabled={canceling} onClick={handleCancel}>
                {canceling ? "מבטל..." : "בטל תור"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
