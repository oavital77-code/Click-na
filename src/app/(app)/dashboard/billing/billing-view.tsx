"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/dates";
import type { AccessState } from "@/lib/access";
import { formatPriceIls } from "@/lib/plan";
import { statusBadgeClass, type StatusTone } from "@/lib/status-badge";

type PaymentRow = {
  id: string;
  amount: number;
  status: "succeeded" | "failed" | "refunded";
  paidAt: string;
  periodEnd: string | null;
};

const PAYMENT_TONE: Record<PaymentRow["status"], StatusTone> = {
  succeeded: "open",
  failed: "danger",
  refunded: "neutral",
};

export function BillingView({
  state,
  price,
  canPay,
  timezone,
  returned,
  payments,
}: {
  state: AccessState;
  price: string | null;
  canPay: boolean;
  timezone: string;
  returned: string | null;
  payments: PaymentRow[];
}) {
  const { m, locale } = useI18n();
  const b = m.billing;
  const router = useRouter();
  const [busy, setBusy] = useState<"activate" | "cancel" | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const day = (iso: string) => fmt(new Date(iso), timezone, locale, "date");

  async function activate() {
    setBusy("activate");
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "failed");
      window.location.assign(json.url);
    } catch {
      setError(m.common.genericError);
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy("cancel");
    setError(null);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      if (!res.ok) throw new Error("failed");
      setConfirmCancel(false);
      router.refresh();
    } catch {
      setError(m.common.genericError);
    } finally {
      setBusy(null);
    }
  }

  const headline = (() => {
    switch (state.kind) {
      case "trialing":
        return { title: b.state.trialing(state.daysLeft), hint: b.state.trialingHint, tone: "held" as StatusTone };
      case "grace":
        return {
          title: state.reason === "trial_ended" ? b.state.graceTrial(state.daysLeft) : b.state.gracePayment(state.daysLeft),
          hint: b.state.graceHint,
          tone: "booked" as StatusTone,
        };
      case "locked":
        return {
          title:
            state.reason === "trial_ended"
              ? b.state.lockedTrial
              : state.reason === "payment_failed"
                ? b.state.lockedPayment
                : b.state.lockedCanceled,
          hint: b.state.lockedHint,
          tone: "danger" as StatusTone,
        };
      case "active":
        return {
          title: state.periodEnd ? b.state.active(day(state.periodEnd.toISOString())) : b.state.activeNoDate,
          hint: null,
          tone: "open" as StatusTone,
        };
      case "canceling":
        return { title: b.state.canceling(day(state.periodEnd.toISOString())), hint: b.state.cancelingHint, tone: "neutral" as StatusTone };
    }
  })();

  const showActivate = state.kind !== "active";
  // A paid subscription has a period end; an account from before billing does not, and has nothing to cancel.
  const showCancel = state.kind === "active" && state.periodEnd !== null;

  return (
    <div className="flex flex-col gap-6">
      {returned && returned in b.returned && (
        <p
          role="status"
          className={
            returned === "success"
              ? "rounded-md border border-st-open/35 bg-st-open-bg/60 px-4 py-3 text-sm text-st-open"
              : "rounded-md border border-border bg-secondary px-4 py-3 text-sm text-muted-foreground"
          }
        >
          {b.returned[returned as keyof typeof b.returned]}
        </p>
      )}

      {/* The plan card: one price, said once, large — everything else supports it. */}
      <Card className="border-primary/25 shadow-primary/5 relative overflow-hidden shadow-xl">
        <div aria-hidden className="from-primary via-accent to-primary absolute inset-x-0 top-0 h-1 bg-gradient-to-r" />
        <CardHeader className="pb-2">
          <div className="flex flex-col items-center gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-col items-center gap-2 md:items-start">
              <CardTitle className="text-2xl">{b.planName}</CardTitle>
              {price ? (
                <p className="flex flex-wrap items-baseline justify-center gap-x-2 md:justify-start" dir="ltr">
                  <span className="num text-4xl font-medium tracking-tight md:text-5xl">{price}</span>
                  <span className="text-muted-foreground text-sm">{b.perMonthSuffix}</span>
                  <span className="text-muted-foreground text-xs">· {b.inclVat}</span>
                </p>
              ) : (
                <CardDescription>{b.noPrice}</CardDescription>
              )}
            </div>
            <span className={cn(statusBadgeClass(headline.tone), "px-3 py-1 text-sm")}>{headline.title}</span>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {headline.hint && <p className="text-muted-foreground text-sm leading-relaxed">{headline.hint}</p>}

          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {b.included.map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-sm leading-relaxed">
                <span className="bg-primary/10 text-primary-strong mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full">
                  <Check className="size-3" aria-hidden />
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>

          {error && <p className="text-st-danger text-sm">{error}</p>}

          <div className="flex flex-col items-center gap-3 md:flex-row md:items-center">
            {showActivate && (
              <Button onClick={activate} disabled={!canPay || busy !== null} size="lg" variant="accent" className="w-full font-medium md:w-auto">
                {busy === "activate" ? b.activating : state.kind === "canceling" ? b.reactivate : b.activate}
              </Button>
            )}
            {showCancel && !confirmCancel && (
              <Button variant="outline" onClick={() => setConfirmCancel(true)} disabled={busy !== null} className="min-h-11">
                {b.cancel}
              </Button>
            )}
            {showCancel && confirmCancel && (
              <div className="flex flex-col items-center gap-2 md:flex-row">
                <span className="text-sm">{b.cancelConfirm}</span>
                <Button variant="destructive" onClick={cancel} disabled={busy !== null} className="min-h-11">
                  {busy === "cancel" ? b.canceling : b.cancel}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmCancel(false)} disabled={busy !== null} className="min-h-11">
                  {b.keep}
                </Button>
              </div>
            )}
          </div>
          {showActivate && <p className="text-muted-foreground text-xs">{canPay ? b.securePayment : b.noPrice}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{b.history}</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-muted-foreground text-sm">{b.noHistory}</p>
          ) : (
            <ul className="divide-border flex flex-col divide-y">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-col items-center gap-1 py-3 text-sm md:flex-row md:justify-between">
                  <span className="text-muted-foreground">{day(p.paidAt)}</span>
                  <span dir="ltr" className="font-medium">
                    {formatPriceIls(p.amount, locale)}
                  </span>
                  <span className={statusBadgeClass(PAYMENT_TONE[p.status])}>{b.paymentStatus[p.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
