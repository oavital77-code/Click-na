"use client";

import { Check, CreditCard, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { statusBadgeClass } from "@/lib/status-badge";
import { useI18n } from "@/i18n/client";
import { PAYPLUS_SIGNUP_URL } from "@/lib/plan";

/**
 * How a therapist gets card payments: their own PayPlus account, opened
 * through Cleana+'s referral link, and its payment link pasted into the
 * payment-link add-on. Three steps, shown in order; the last one ticks itself
 * once a payment link (or the automatic PayPlus connection) is in place.
 */
export function PayPlusSignupCard({ connected }: { connected: boolean }) {
  const { m } = useI18n();
  const t = m.paymentSetup.signup;
  const steps = [
    { title: t.step1Title, body: t.step1Body, cta: true },
    { title: t.step2Title, body: t.step2Body, cta: false },
    { title: t.step3Title, body: t.step3Body, cta: false },
  ];

  return (
    <Card className="min-w-0 gap-4 text-center md:text-start">
      <CardHeader className="flex flex-col items-stretch gap-2">
        <div className="flex flex-col items-center gap-2 md:flex-row md:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="text-primary size-5" strokeWidth={1.75} />
            {t.title}
          </CardTitle>
          {connected && <span className={statusBadgeClass("open")}>{t.done}</span>}
        </div>
        <CardDescription>{t.lead}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <ol className="flex flex-col gap-4 text-start">
          {steps.map((step, i) => {
            const done = connected && i === steps.length - 1;
            return (
              <li key={step.title} className="flex gap-3">
                <span
                  aria-hidden
                  className={
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-medium " +
                    (done ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")
                  }
                >
                  {done ? <Check className="size-4" /> : i + 1}
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-medium">{step.title}</p>
                  <p className="text-muted-foreground text-sm">{step.body}</p>
                  {step.cta && (
                    <Button asChild className="mt-1 self-start">
                      <a href={PAYPLUS_SIGNUP_URL} target="_blank" rel="noreferrer noopener">
                        {t.step1Cta}
                        <ExternalLink className="size-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="text-muted-foreground border-border rounded-md border p-3 text-start text-xs">{t.automaticNote}</p>
      </CardContent>
    </Card>
  );
}
