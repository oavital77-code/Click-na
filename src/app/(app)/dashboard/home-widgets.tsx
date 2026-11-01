"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, MessageCircle, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";

/**
 * The home screen's pieces: what is next, what is today, what is owed and how
 * the week looks. Data is shaped on the server (page.tsx); these only draw it
 * and handle the two things a therapist does from here without leaving the
 * page — sending the WhatsApp reminder and marking a session paid.
 */

/** The two actions done every day, at the top: copy the booking link, open an hour. */
export function HomeActions({ publicUrl }: { publicUrl: string }) {
  const { m } = useI18n();
  const t = m.dashboard.home;
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:gap-3">
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(publicUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        className="border-border bg-card hover:bg-secondary flex min-h-14 items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-semibold whitespace-nowrap transition-colors md:min-h-11 md:rounded-full md:px-5"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? t.copied : t.copyLink}
      </button>
      <a
        href="#calendar"
        className="bg-primary text-primary-foreground hover:bg-primary/90 flex min-h-14 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-bold transition-colors md:min-h-11 md:rounded-full"
      >
        <Plus className="size-4" />
        {t.openHour}
      </a>
    </div>
  );
}

export type FirstSteps = {
  publicUrl: string;
  hasOpenHours: boolean;
  hasLogo: boolean;
  hasPaymentLink: boolean;
};

/**
 * Until the first booking arrives, the home screen's lead card is the way to
 * it: hours open, a look at the page clients see, the link sent to someone.
 * The two after that are what makes the page theirs and gets them paid.
 */
export function FirstStepsCard({ steps }: { steps: FirstSteps }) {
  const { m } = useI18n();
  const t = m.dashboard.home.firstSteps;
  const [copied, setCopied] = useState(false);
  const share = `https://wa.me/?text=${encodeURIComponent(t.shareText(steps.publicUrl))}`;

  const items: { done: boolean; title: string; hint: string; action: React.ReactNode; optional?: boolean }[] = [
    {
      done: steps.hasOpenHours,
      title: t.hours,
      hint: steps.hasOpenHours ? t.hoursDone : t.hoursHint,
      action: steps.hasOpenHours ? null : (
        <Link href="/dashboard/availability" className={stepButton}>
          {t.hoursCta}
        </Link>
      ),
    },
    {
      done: false,
      title: t.preview,
      hint: t.previewHint,
      action: (
        <a href={steps.publicUrl} target="_blank" rel="noreferrer noopener" className={stepButton}>
          <ExternalLink className="size-3.5" />
          {t.previewCta}
        </a>
      ),
    },
    {
      done: false,
      title: t.share,
      hint: t.shareHint,
      action: (
        <span className="flex flex-wrap gap-2">
          <a href={share} target="_blank" rel="noreferrer noopener" className={stepButton}>
            <MessageCircle className="size-3.5" />
            {t.shareWhatsapp}
          </a>
          <button
            type="button"
            className={stepButton}
            onClick={() => {
              void navigator.clipboard.writeText(steps.publicUrl).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? t.copied : t.copy}
          </button>
        </span>
      ),
    },
    {
      done: steps.hasLogo,
      title: t.brand,
      hint: t.brandHint,
      optional: true,
      action: steps.hasLogo ? null : (
        <Link href="/dashboard/link" className={stepButton}>
          {t.brandCta}
        </Link>
      ),
    },
    {
      done: steps.hasPaymentLink,
      title: t.payment,
      hint: t.paymentHint,
      optional: true,
      action: steps.hasPaymentLink ? null : (
        <Link href="/dashboard/addons" className={stepButton}>
          {t.paymentCta}
        </Link>
      ),
    },
  ];

  return (
    <section aria-labelledby="first-steps-h" className="home-rise home-d1 border-border bg-card flex flex-col gap-4 rounded-[28px] border p-5 md:p-7">
      <div className="flex flex-col gap-1">
        <h2 id="first-steps-h" className="text-xl font-bold">
          {t.title}
        </h2>
        <p className="text-muted-foreground text-sm">{t.lead}</p>
      </div>
      <ol className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={i} className="bg-background border-border/70 flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center">
            <span className="flex min-w-0 flex-1 items-start gap-3">
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                  item.done ? "bg-st-open-bg text-st-open" : "bg-secondary text-muted-foreground"
                )}
              >
                {item.done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className={cn("text-base font-semibold", item.done && "text-muted-foreground line-through")}>
                  {item.title}
                  {item.optional && !item.done && <span className="text-muted-foreground ms-2 text-xs font-normal">{t.optional}</span>}
                </span>
                <span className="text-muted-foreground text-sm">{item.hint}</span>
              </span>
            </span>
            {item.action && <span className="shrink-0 ps-9 sm:ps-0">{item.action}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

const stepButton =
  "border-primary text-primary-strong hover:bg-primary/10 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-bold whitespace-nowrap transition-colors";

export type NextSession = {
  bookingId: string;
  heading: string;
  timeRange: string;
  clientName: string;
  where: string | null;
  reminderLink: string | null;
  reminderSent: boolean;
  soon: boolean;
};

/** The hero: who is next, when and where, with the reminder one tap away. */
export function NextSessionCard({ next }: { next: NextSession | null }) {
  const { m } = useI18n();
  const t = m.dashboard.home;
  const [sent, setSent] = useState(next?.reminderSent ?? false);

  if (!next) {
    return (
      <section className="home-rise home-d1 border-border bg-card flex flex-col gap-1 rounded-[28px] border border-dashed p-6 md:p-7">
        <h2 className="text-lg font-bold">{t.noNext}</h2>
        <p className="text-muted-foreground text-sm">{t.noNextHint}</p>
      </section>
    );
  }

  return (
    <section
      aria-label={next.heading}
      className="home-rise home-d1 bg-foreground text-background md:bg-primary md:text-primary-foreground flex flex-col gap-5 rounded-[28px] p-6 md:flex-row md:flex-wrap md:items-center md:p-7"
    >
      <div className="flex min-w-0 flex-1 items-start gap-4">
        {next.soon && <span aria-hidden className="home-pulse bg-primary md:bg-primary-foreground mt-2 size-3 shrink-0 rounded-full" />}
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-primary md:text-primary-foreground/85 text-sm font-semibold">
            {next.heading} · <span className="num">{next.timeRange}</span>
          </span>
          <span className="truncate text-3xl leading-tight font-extrabold">{next.clientName}</span>
          {next.where && <span className="text-sm opacity-85">{next.where}</span>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
        {next.reminderLink ? (
          <a
            href={next.reminderLink}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => {
              fetch(`/api/bookings/${next.bookingId}/reminder`, { method: "POST" })
                .then((res) => res.ok && setSent(true))
                .catch(() => {});
            }}
            className="flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-3 text-sm font-bold whitespace-nowrap text-[#0B3B1E] md:min-h-11 md:rounded-full md:bg-white/15 md:px-4 md:text-inherit"
          >
            <MessageCircle className="size-4" />
            {sent ? t.reminded : t.remind}
          </a>
        ) : (
          <span />
        )}
        <Link
          href="/dashboard/bookings"
          className="bg-background/10 md:bg-primary-foreground md:text-primary-strong flex min-h-13 items-center justify-center rounded-2xl px-4 text-sm font-bold md:min-h-11 md:rounded-full"
        >
          {t.allBookings}
        </Link>
      </div>
    </section>
  );
}

export type TodayItem = {
  id: string;
  time: string;
  kind: "booked" | "open" | "blocked" | "held";
  title: string;
  sub: string | null;
  /** The booking behind a booked slot, when a payment can still be marked on it. */
  bookingId: string | null;
  paid: boolean;
  /** Over: a booked slot whose end has passed. */
  done: boolean;
};

const BADGE: Record<string, string> = {
  booked: "bg-st-booked-bg text-st-booked",
  open: "bg-st-open-bg text-st-open",
  blocked: "bg-st-blocked-bg text-muted-foreground",
  held: "bg-st-held-bg text-st-booked",
  paid: "bg-st-open-bg text-st-open",
  done: "bg-secondary text-muted-foreground",
};

const DOT: Record<TodayItem["kind"], string> = {
  booked: "bg-primary",
  held: "bg-st-held",
  open: "bg-st-open",
  blocked: "bg-st-blocked",
};

/**
 * Today, in order, with a "now" line where the present falls between
 * sessions. A finished, unpaid booking can be marked paid right here.
 */
export function TodayList({ items, nowIndex }: { items: TodayItem[]; nowIndex: number | null }) {
  const { m } = useI18n();
  const t = m.dashboard.home;
  const [paid, setPaid] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function markPaid(bookingId: string) {
    setBusy(bookingId);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark", paid: true }),
      });
      if (!res.ok) throw new Error("failed");
      setPaid((p) => ({ ...p, [bookingId]: true }));
    } catch {
      setError(t.markFailed);
    } finally {
      setBusy(null);
    }
  }

  const nowLine = (
    <li key="now" aria-label={t.now} className="flex items-center gap-3 py-1">
      <span className="text-primary w-14 shrink-0 text-xs font-bold">{t.now}</span>
      <span aria-hidden className="home-breathe bg-primary h-0.5 flex-1 rounded-full" />
    </li>
  );

  if (items.length === 0) {
    return <p className="text-muted-foreground py-6 text-center text-sm">{t.emptyToday}</p>;
  }

  return (
    <>
      <ol className="flex flex-col gap-2">
        {items.map((item, i) => {
          const isPaid = item.paid || (item.bookingId ? paid[item.bookingId] : false);
          const badgeKey = item.kind === "booked" ? (isPaid ? "paid" : item.done ? "done" : "booked") : item.kind;
          return [
            nowIndex === i ? nowLine : null,
            <li
              key={item.id}
              className={cn(
                "home-rise flex items-center gap-3 rounded-2xl px-4 py-3 transition-shadow",
                item.kind === "open" ? "border-st-open-bg border-[1.5px] border-dashed" : "bg-background border-border/70 border",
                "hover:shadow-[0_10px_24px_-14px_rgba(110,60,20,.35)]"
              )}
              style={{ animationDelay: `${0.12 + i * 0.05}s` }}
            >
              <span className="num w-14 shrink-0 text-sm font-bold">{item.time}</span>
              <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", DOT[item.kind])} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn("truncate text-base font-semibold", item.done && "text-muted-foreground")}>{item.title}</span>
                {item.sub && <span className="text-muted-foreground truncate text-xs">{item.sub}</span>}
              </span>
              {item.kind === "booked" && item.done && !isPaid && item.bookingId ? (
                <button
                  type="button"
                  disabled={busy === item.bookingId}
                  onClick={() => void markPaid(item.bookingId!)}
                  className="border-primary text-primary-strong hover:bg-primary/10 min-h-9 shrink-0 rounded-full border px-3 text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {t.markPaid}
                </button>
              ) : (
                <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold", BADGE[badgeKey])}>
                  {badgeKey === "paid" && (
                    <svg className="home-check size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                  {t.badge[badgeKey as keyof typeof t.badge]}
                </span>
              )}
            </li>,
          ];
        })}
        {nowIndex === items.length ? nowLine : null}
      </ol>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </>
  );
}

/** One bar per day, booked sessions, today in the accent. */
export function WeekBars({ days }: { days: { label: string; count: number; today: boolean }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div className="grid h-24 grid-cols-7 items-end gap-1.5" aria-hidden>
      {days.map((d, i) => (
        <div key={i} className="flex h-full flex-col items-center justify-end gap-1.5">
          <span
            className={cn("home-grow w-full max-w-[22px] rounded-lg", d.today ? "bg-primary" : "bg-secondary")}
            style={{ height: `${12 + (d.count / max) * 60}px`, animationDelay: `${0.3 + i * 0.04}s` }}
          />
          <span className="text-muted-foreground text-xs">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
