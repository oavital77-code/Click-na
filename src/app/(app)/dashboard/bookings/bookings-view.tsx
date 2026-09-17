"use client";

import { useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { bookingStatusTone, statusBadgeClass } from "@/lib/status-badge";
import { paymentRequestWhatsApp, reminderWhatsApp } from "@/lib/whatsapp-templates";
import { whatsappLink } from "@/lib/whatsapp-link";
import { formatPriceIls } from "@/lib/plan";
import { Check, Copy, MessageCircle } from "lucide-react";
import type { Treatment } from "@/lib/treatments";

const CANCELABLE = new Set(["pending", "confirmed"]);

type Booking = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  clientName: string;
  clientPhone: string | null;
  clientNote: string | null;
  manageToken: string;
  /** When a WhatsApp reminder went out — automatically or by the therapist's tap. */
  reminderSentAt: string | null;
  /** False when no reminder was ever queued: the booking came in too close to the time. */
  hasScheduledReminder: boolean;
  clientEmail: string | null;
  paid: boolean;
  /** What the client was asked for, once the therapist asked. */
  paymentAmountIls: number | null;
  paymentLabel: string | null;
  paymentUrl: string | null;
  paymentRequestedAt: string | null;
};

type Props = {
  timezone: string;
  slug: string;
  therapistFullName: string;
  location: string | null;
  treatments: Treatment[];
  initialBookings: Booking[];
};

type Filter = "today" | "tomorrow" | "week" | "all" | "recent";

export function BookingsView({ timezone, slug, therapistFullName, location, treatments, initialBookings }: Props) {
  const { m, locale } = useI18n();
  const [bookings, setBookings] = useState(initialBookings);
  const [filter, setFilter] = useState<Filter>("today");
  const [canceling, setCanceling] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [today] = useState(() => formatInTimeZone(new Date(), timezone, "yyyy-MM-dd"));
  const [tomorrow] = useState(() =>
    formatInTimeZone(new Date(Date.now() + 24 * 60 * 60 * 1000), timezone, "yyyy-MM-dd")
  );

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      const dateStr = formatInTimeZone(new Date(b.startsAt), timezone, "yyyy-MM-dd");
      // Sessions already behind us, newest first below — the ones to bill.
      if (filter === "recent") return dateStr < today;
      if (filter === "all") return dateStr >= today;
      if (filter === "today") return dateStr === today;
      if (filter === "tomorrow") return dateStr === tomorrow;
      // week: today..+6 days, compared as strings works since both are yyyy-MM-dd
      const weekEnd = formatInTimeZone(
        new Date(new Date(today).getTime() + 7 * 24 * 60 * 60 * 1000),
        timezone,
        "yyyy-MM-dd"
      );
      return dateStr >= today && dateStr < weekEnd;
    });
  }, [bookings, filter, timezone, today, tomorrow]);

  /**
   * The therapist's own WhatsApp, not ours: the button opens wa.me with the
   * same reminder text the automatic channel would send, addressed to the
   * client. Recording it afterwards is what turns the button into "sent ✓" so
   * nobody reminds the same client twice.
   */
  function sendManualReminder(booking: Booking) {
    if (!booking.clientPhone) return;
    const text = reminderWhatsApp({
      locale,
      clientFullName: booking.clientName,
      therapistFullName,
      startsAt: new Date(booking.startsAt),
      endsAt: new Date(booking.endsAt),
      timezone,
      location,
      manageUrl: `${window.location.origin}/book/${slug}/manage/${booking.manageToken}`,
    });
    const link = whatsappLink(booking.clientPhone, text);
    if (!link) return;
    window.open(link, "_blank", "noopener,noreferrer");
    fetch(`/api/bookings/${booking.id}/reminder`, { method: "POST" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { sentAt?: string } | null) => {
        if (!data?.sentAt) return;
        setBookings((prev) =>
          prev.map((b) => (b.id === booking.id ? { ...b, reminderSentAt: data.sentAt! } : b))
        );
      })
      .catch(() => {});
  }

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
        {(["today", "tomorrow", "week", "all", "recent"] as const).map((value) => (
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
      {filter === "tomorrow" && filtered.length > 0 && (
        <p className="text-muted-foreground text-xs">{m.bookings.reminderHint}</p>
      )}

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
                  {CANCELABLE.has(booking.status) && (
                    <PaymentControls
                      booking={booking}
                      treatments={treatments}
                      therapistFullName={therapistFullName}
                      timezone={timezone}
                      onChange={(patch) =>
                        setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, ...patch } : b)))
                      }
                    />
                  )}
                  <p className="font-medium">{booking.clientName}</p>
                  {booking.clientPhone && (
                    <p className="text-muted-foreground text-sm">{booking.clientPhone}</p>
                  )}
                  {booking.clientNote && (
                    <p className="text-muted-foreground text-sm">{m.bookings.note(booking.clientNote)}</p>
                  )}

                  {/* Booked inside the reminder lead time, so the automatic one
                      never got queued. Saying so is what turns the button below
                      from a convenience into the thing to do. */}
                  {CANCELABLE.has(booking.status) && !booking.hasScheduledReminder && !booking.reminderSentAt && (
                    <p className="text-muted-foreground text-xs">{m.bookings.noAutoReminder}</p>
                  )}

                  {CANCELABLE.has(booking.status) &&
                    (booking.reminderSentAt ? (
                      <p className="text-st-open text-xs">{m.bookings.reminderSent}</p>
                    ) : booking.clientPhone ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full md:w-fit"
                        onClick={() => sendManualReminder(booking)}
                      >
                        <MessageCircle className="size-4" />
                        {m.bookings.whatsappReminder}
                      </Button>
                    ) : (
                      <p className="text-muted-foreground text-xs">{m.bookings.noPhone}</p>
                    ))}

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

/**
 * Everything about money on one booking, after the session: pick a treatment
 * or type a sum, create the link, send it. The therapist's WhatsApp opens with
 * the message ready; the email goes out on its own. Or, for a client who paid
 * some other way, just mark it.
 */
function PaymentControls({
  booking,
  treatments,
  therapistFullName,
  timezone,
  onChange,
}: {
  booking: Booking;
  treatments: Treatment[];
  therapistFullName: string;
  timezone: string;
  onChange: (patch: Partial<Booking>) => void;
}) {
  const { m, locale } = useI18n();
  const b = m.bookings;
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(treatments[0]?.id ?? null);
  const [free, setFree] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const chosen = treatments.find((t) => t.id === selected) ?? null;
  const amountIls = chosen ? chosen.priceIls : Number(free);
  const canSend = Number.isFinite(amountIls) && amountIls > 0;

  function whatsappHref(url: string, amount: number, label: string | null) {
    if (!booking.clientPhone) return null;
    return whatsappLink(
      booking.clientPhone,
      paymentRequestWhatsApp({
        locale,
        therapistFullName,
        startsAt: new Date(booking.startsAt),
        endsAt: new Date(booking.endsAt),
        timezone,
        label,
        paymentUrl: url,
        paymentAmount: formatPriceIls(amount, locale),
      })
    );
  }

  async function send() {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", amountIls, label: chosen?.name ?? null }),
      });
      const data = (await res.json()) as { url?: string; amountIls?: number; requestedAt?: string; error?: string; detail?: string };
      if (!res.ok || !data.url) {
        setError(data.error === "ALREADY_PAID" ? b.alreadyPaid : data.detail ? `${b.requestFailed} (${data.detail})` : b.requestFailed);
        return;
      }
      const label = chosen?.name ?? null;
      onChange({ paymentUrl: data.url, paymentAmountIls: data.amountIls ?? amountIls, paymentLabel: label, paymentRequestedAt: data.requestedAt ?? new Date().toISOString() });
      setOpen(false);
      // Straight into their WhatsApp with the message written — the fastest
      // "send" there is. The email is already on its way from the server.
      const href = whatsappHref(data.url, data.amountIls ?? amountIls, label);
      if (href) window.open(href, "_blank", "noopener,noreferrer");
    } catch {
      setError(b.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  async function mark(paid: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark", paid }),
      });
      if (res.ok) onChange({ paid });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!booking.paymentUrl) return;
    try {
      await navigator.clipboard.writeText(booking.paymentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The link is in the message the therapist can open; nothing to recover.
    }
  }

  const requestedHref =
    booking.paymentUrl && booking.paymentAmountIls
      ? whatsappHref(booking.paymentUrl, booking.paymentAmountIls, booking.paymentLabel)
      : null;

  return (
    <div className="flex flex-col items-center gap-2 md:items-start">
      {booking.paid ? (
        <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
          <span className={statusBadgeClass("open")}>
            {booking.paymentAmountIls ? b.paidAmount(formatPriceIls(booking.paymentAmountIls, locale)) : b.paid}
          </span>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => mark(false)}>
            {b.markUnpaid}
          </Button>
        </div>
      ) : booking.paymentRequestedAt && booking.paymentAmountIls ? (
        <div className="flex flex-col items-center gap-1 md:items-start">
          <p className="text-sm">{b.requested(formatPriceIls(booking.paymentAmountIls, locale), booking.paymentLabel)}</p>
          <p className="text-muted-foreground text-xs">
            {b.requestedOn(fmt(booking.paymentRequestedAt, timezone, locale, "weekdayDateShort"))}
            {booking.clientEmail ? ` · ${b.emailSent}` : ""}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
            {requestedHref && (
              <Button asChild variant="outline" size="sm">
                <a href={requestedHref} target="_blank" rel="noreferrer noopener">
                  <MessageCircle className="size-4" />
                  {b.openWhatsapp}
                </a>
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? b.copied : b.copyLink}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setOpen((o) => !o)}>
              {b.sendAgain}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => mark(true)}>
              {b.markPaid}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setOpen((o) => !o)}>
            {b.requestPayment}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => mark(true)}>
            {b.markPaid}
          </Button>
        </div>
      )}

      {open && !booking.paid && (
        <form
          className="border-border flex w-full flex-col gap-3 rounded-md border p-3 text-start"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <p className="text-sm font-medium">{b.choosePrice}</p>
          {treatments.length === 0 && <p className="text-muted-foreground text-xs">{b.noTemplates}</p>}
          {treatments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {treatments.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelected(t.id);
                    setFree("");
                  }}
                  className={
                    selected === t.id
                      ? "bg-primary text-primary-foreground rounded-full px-3 py-1 text-sm"
                      : "bg-muted hover:bg-muted/70 rounded-full px-3 py-1 text-sm"
                  }
                >
                  {t.name} · {formatPriceIls(t.priceIls, locale)}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor={`free-${booking.id}`} className="text-xs">
              {b.freeAmount}
            </label>
            <Input
              id={`free-${booking.id}`}
              type="number"
              inputMode="decimal"
              min={1}
              step={0.01}
              dir="ltr"
              className="sm:w-40"
              value={free}
              onChange={(e) => {
                setFree(e.target.value);
                if (e.target.value !== "") setSelected(null);
              }}
            />
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={busy || !canSend}>
              {busy ? b.sending : b.sendRequest}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>
              {m.common.cancel}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

