"use client";

import { useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { bookingStatusTone, statusBadgeClass } from "@/lib/status-badge";

const CANCELABLE = new Set(["pending", "confirmed"]);

type Booking = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  clientName: string;
  clientPhone: string | null;
  clientNote: string | null;
};

type Props = {
  timezone: string;
  initialBookings: Booking[];
};

type Filter = "today" | "week" | "all";

export function BookingsView({ timezone, initialBookings }: Props) {
  const { m, locale } = useI18n();
  const [bookings, setBookings] = useState(initialBookings);
  const [filter, setFilter] = useState<Filter>("today");
  const [canceling, setCanceling] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [today] = useState(() => formatInTimeZone(new Date(), timezone, "yyyy-MM-dd"));

  const filtered = useMemo(() => {
    if (filter === "all") return bookings;
    return bookings.filter((b) => {
      const dateStr = formatInTimeZone(new Date(b.startsAt), timezone, "yyyy-MM-dd");
      if (filter === "today") return dateStr === today;
      // week: today..+6 days, compared as strings works since both are yyyy-MM-dd
      const weekEnd = formatInTimeZone(
        new Date(new Date(today).getTime() + 7 * 24 * 60 * 60 * 1000),
        timezone,
        "yyyy-MM-dd"
      );
      return dateStr >= today && dateStr < weekEnd;
    });
  }, [bookings, filter, timezone, today]);

  async function confirmCancel(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      if (!res.ok) {
        setError(m.common.genericError);
        return;
      }
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: "canceled_by_therapist" } : b))
      );
      setCanceling(null);
      setReason("");
    } catch {
      setError(m.common.networkError);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-center gap-2 md:justify-start">
        {(["today", "week", "all"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            variant={filter === value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(value)}
          >
            {m.bookings.filters[value]}
          </Button>
        ))}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.bookings.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((booking) => (
            <li key={booking.id}>
              <Card>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex flex-col items-center gap-2 md:flex-row md:justify-between">
                    <span className="text-sm">
                      {fmt(booking.startsAt, timezone, locale, "weekdayDateShort")} ·{" "}
                      {fmt(booking.startsAt, timezone, locale, "time")}–
                      {fmt(booking.endsAt, timezone, locale, "time")}
                    </span>
                    <span className={statusBadgeClass(bookingStatusTone(booking.status))}>
                      {m.bookings.status[booking.status as keyof typeof m.bookings.status] ?? booking.status}
                    </span>
                  </div>
                  <p className="font-medium">{booking.clientName}</p>
                  {booking.clientPhone && (
                    <p className="text-muted-foreground text-sm">{booking.clientPhone}</p>
                  )}
                  {booking.clientNote && (
                    <p className="text-muted-foreground text-sm">{m.bookings.note(booking.clientNote)}</p>
                  )}

                  {CANCELABLE.has(booking.status) &&
                    (canceling === booking.id ? (
                      <div className="flex flex-col gap-2">
                        <Input
                          placeholder={m.bookings.cancelReasonPlaceholder}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                        <div className="flex flex-wrap justify-center gap-2 md:justify-start">
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => confirmCancel(booking.id)}
                          >
                            {m.bookings.confirmCancel}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setCanceling(null);
                              setReason("");
                            }}
                          >
                            {m.common.back}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full md:w-fit"
                        onClick={() => setCanceling(booking.id)}
                      >
                        {m.bookings.cancelBooking}
                      </Button>
                    ))}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
