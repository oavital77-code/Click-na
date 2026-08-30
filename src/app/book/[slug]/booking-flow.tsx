"use client";

import { useEffect, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { he } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DAY_LABELS } from "@/lib/labels";

type Slot = { id: string; startsAt: string; endsAt: string };
type DayAvailability = { date: string; slots: Slot[] };

type Props = {
  slug: string;
  timezone: string;
  durationMinutes: number;
  requirePhone: boolean;
  cancellationPolicyHours: number;
  location: { address: string | null; onlineMeetingUrl: string | null };
};

const ERROR_MESSAGES: Record<string, string> = {
  SLOT_ALREADY_BOOKED: "המועד שבחרת כבר נתפס. אנא בחר מועד אחר.",
  SLOT_ON_HOLD: "מישהו אחר באמצע הזמנת המועד הזה. נסה מועד אחר.",
  BOOKING_TOO_SOON: "המועד קרוב מדי לזמן הנוכחי.",
};

export function BookingFlow({ slug, timezone, requirePhone }: Props) {
  const [step, setStep] = useState<"date" | "time" | "form" | "confirmed">("date");
  const [days, setDays] = useState<DayAvailability[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
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

  useEffect(() => {
    const from = new Date();
    const to = new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => formatInTimeZone(d, timezone, "yyyy-MM-dd");

    fetch(`/api/public/therapists/${slug}/availability?from=${fmt(from)}&to=${fmt(to)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data) => setDays(data.days))
      .catch(() => setLoadError(true));
  }, [slug, timezone]);

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
      setFormError(ERROR_MESSAGES[data.error] ?? "המועד כבר לא זמין, בחר מועד אחר");
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
        setFormError(
          ERROR_MESSAGES[data.error] ?? "אירעה שגיאה, נסה שוב"
        );
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
      setFormError("שגיאת רשת, נסה שוב");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return <p className="text-destructive text-center text-sm">שגיאה בטעינת הזמנים. נסה לרענן.</p>;
  }

  if (step === "confirmed" && selectedSlot) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <p className="text-3xl">✓</p>
          <p className="text-lg font-semibold">התור נקבע!</p>
          <p>
            {formatInTimeZone(new Date(selectedSlot.startsAt), timezone, "EEEE, d.M.yyyy", { locale: he })}
            <br />
            {formatInTimeZone(new Date(selectedSlot.startsAt), timezone, "HH:mm")}–
            {formatInTimeZone(new Date(selectedSlot.endsAt), timezone, "HH:mm")}
          </p>
          {manageToken && (
            <a
              href={`/book/${slug}/manage/${manageToken}`}
              className="text-primary text-sm underline underline-offset-4"
            >
              שנה / בטל תור
            </a>
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
            {formatInTimeZone(new Date(selectedSlot.startsAt), timezone, "EEEE, d.M", { locale: he })} ·{" "}
            {formatInTimeZone(new Date(selectedSlot.startsAt), timezone, "HH:mm")}–
            {formatInTimeZone(new Date(selectedSlot.endsAt), timezone, "HH:mm")}
          </p>
          {secondsLeft !== null && !expired && (
            <p className="text-muted-foreground text-xs">
              המועד שמור לך למשך {Math.floor(secondsLeft / 60)}:
              {String(secondsLeft % 60).padStart(2, "0")} דקות
            </p>
          )}
          {expired ? (
            <div className="flex flex-col gap-2">
              <p className="text-destructive text-sm">הזמן לתפיסת המועד פג. בחר מועד שוב.</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep("time");
                  setSelectedSlot(null);
                  setHoldExpiresAt(null);
                }}
              >
                בחר מועד אחר
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="fullName">שם מלא</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">טלפון{requirePhone && " *"}</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">אימייל</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="note">הערה (אופציונלי)</Label>
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
                {submitting ? "מאשר..." : "אישור הזמנה"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!days) {
    return <p className="text-muted-foreground text-center text-sm">טוען זמנים פנויים...</p>;
  }

  const availableDates = days.filter((d) => d.slots.length > 0);

  if (step === "time" && selectedDate) {
    const day = days.find((d) => d.date === selectedDate);
    return (
      <div className="flex flex-col gap-4">
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setStep("date")}>
          → בחר תאריך אחר
        </Button>
        {formError && <p className="text-destructive text-sm">{formError}</p>}
        <div className="grid grid-cols-3 gap-2">
          {(day?.slots ?? []).map((slot) => (
            <Button key={slot.id} type="button" variant="outline" onClick={() => selectSlot(slot)}>
              {formatInTimeZone(new Date(slot.startsAt), timezone, "HH:mm")}
            </Button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">השעות מוצגות לפי אזור הזמן של המטפל</p>
      </div>
    );
  }

  if (availableDates.length === 0) {
    return <p className="text-muted-foreground text-center text-sm">אין זמנים פנויים בקרוב</p>;
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {days.map((d) => {
        const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay();
        const available = d.slots.length > 0;
        return (
          <button
            key={d.date}
            type="button"
            disabled={!available}
            onClick={() => {
              setSelectedDate(d.date);
              setStep("time");
            }}
            className={cn(
              "flex min-w-16 flex-col items-center gap-1 rounded-md border px-3 py-2 text-sm",
              available ? "hover:bg-accent" : "text-muted-foreground opacity-40"
            )}
          >
            <span>{DAY_LABELS[dow]}</span>
            <span className="font-semibold">{d.date.slice(8, 10)}</span>
          </button>
        );
      })}
    </div>
  );
}
