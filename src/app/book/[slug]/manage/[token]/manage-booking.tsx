"use client";

import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { he } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  token: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  status: string;
  therapistFullName: string;
  therapistPhone: string | null;
  withinPolicyWindow: boolean;
};

const CANCELED_STATUSES = ["canceled_by_client", "canceled_by_therapist"];

export function ManageBooking({
  token,
  timezone,
  startsAt,
  endsAt,
  status: initialStatus,
  therapistFullName,
  therapistPhone,
  withinPolicyWindow,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);

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
            לא ניתן לבטל אונליין בטווח זה.
            {therapistPhone && ` צור קשר עם ${therapistFullName}: ${therapistPhone}`}
          </p>
        ) : (
          <>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button
              type="button"
              variant="destructive"
              disabled={canceling}
              onClick={handleCancel}
              className="w-fit"
            >
              {canceling ? "מבטל..." : "בטל תור"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
