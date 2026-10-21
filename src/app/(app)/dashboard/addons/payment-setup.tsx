"use client";

import { useState } from "react";
import { Clock, CreditCard, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { statusBadgeClass } from "@/lib/status-badge";
import type { ApplicationSummary } from "@/lib/payment-applications";
import { BUSINESS_TYPES, type BusinessType } from "@/lib/payment-application-schema";
import { useI18n } from "@/i18n/client";

type Values = {
  businessType: BusinessType;
  legalName: string;
  idNumber: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  bankCode: string;
  branchCode: string;
  accountNumber: string;
  accountHolder: string;
  monthlyVolumeIls: string;
  acceptTerms: boolean;
};

/**
 * The card-payments add-on. Instead of asking for PayPlus API keys, it asks for
 * what PayPlus needs to open an account under our partnership, and then shows
 * where that application stands. Switching payments off and on is the toggle
 * on the card, as for any add-on, once the account exists.
 */
export function PaymentSetupCard({
  connected,
  application,
  feePct,
  defaults,
  hint,
  onToggle,
  busy,
  toggleError,
}: {
  connected: boolean;
  application: ApplicationSummary | null;
  feePct: number;
  defaults: { fullName: string; phone: string; email: string };
  hint: string | null;
  onToggle: () => void;
  busy: boolean;
  toggleError: string | null;
}) {
  const { m, locale } = useI18n();
  const t = m.paymentSetup;
  const [app, setApp] = useState(application);
  const [open, setOpen] = useState(false);

  // An account exists (active application) — payments can be switched on and off.
  const hasAccount = app?.status === "active";
  const submittedOn = app ? new Date(app.submittedAt).toLocaleDateString(locale === "he" ? "he-IL" : "en-GB") : "";

  return (
    <Card className="min-w-0 gap-4 text-center md:text-start">
      <CardHeader className="flex flex-col items-stretch gap-2">
        <div className="flex flex-col items-center gap-2 md:flex-row md:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="text-primary size-5" strokeWidth={1.75} />
            {t.label}
          </CardTitle>
          {hasAccount && (
            <button
              type="button"
              role="switch"
              aria-checked={connected}
              aria-label={m.addons.toggle(connected, t.label)}
              disabled={busy}
              onClick={onToggle}
              className={
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 " +
                "after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-[''] " +
                (connected ? "bg-primary" : "bg-muted-foreground/30")
              }
            >
              <span
                className={
                  "absolute start-0.5 size-5 rounded-full bg-white shadow-sm transition-transform " +
                  (connected ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0")
                }
              />
            </button>
          )}
        </div>
        <CardDescription>{t.summary}</CardDescription>
        <p className="text-muted-foreground text-xs">{t.feeLine(feePct)}</p>
      </CardHeader>

      <CardContent className="flex min-w-0 flex-col gap-3">
        {toggleError && <p className="text-destructive text-sm">{toggleError}</p>}

        {hasAccount && connected && (
          <div className="flex flex-col items-center gap-1 md:items-start">
            <span className={statusBadgeClass("open")}>{m.addons.connected}</span>
            <span className="text-muted-foreground text-xs">{t.activeNote(app!.feePct)}</span>
          </div>
        )}
        {hasAccount && connected && hint && (
          <p className="border-st-held/50 bg-st-held/10 rounded-md border p-2 text-xs">{hint}</p>
        )}

        {app?.status === "pending" && !open && (
          <div className="border-border flex flex-col gap-1 rounded-md border p-3 text-sm">
            <p className="flex items-center justify-center gap-2 font-medium md:justify-start">
              <Clock className="size-4" />
              {t.pendingTitle}
            </p>
            <p className="text-muted-foreground">{t.pendingBody}</p>
            <p className="text-muted-foreground text-xs">
              {t.submittedOn(submittedOn)} · <span dir="ltr">{t.summaryLine(app.legalName, app.bankAccount)}</span>
            </p>
          </div>
        )}

        {app?.status === "rejected" && !open && (
          <div className="border-destructive/40 flex flex-col gap-2 rounded-md border p-3 text-sm">
            <p className="flex items-center justify-center gap-2 font-medium md:justify-start">
              <XCircle className="text-destructive size-4" />
              {t.rejectedTitle}
            </p>
            {app.rejectionReason && <p className="text-muted-foreground">{t.rejectedReason(app.rejectionReason)}</p>}
            <Button type="button" variant="outline" className="self-center md:self-start" onClick={() => setOpen(true)}>
              {t.resubmit}
            </Button>
          </div>
        )}

        {!app && !open && (
          <Button type="button" className="self-center md:self-start" onClick={() => setOpen(true)}>
            {t.start}
          </Button>
        )}

        {open && (
          <ApplicationForm
            feePct={feePct}
            defaults={defaults}
            onDone={(summary) => {
              setApp(summary);
              setOpen(false);
            }}
            onCancel={() => setOpen(false)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ApplicationForm({
  feePct,
  defaults,
  onDone,
  onCancel,
}: {
  feePct: number;
  defaults: { fullName: string; phone: string; email: string };
  onDone: (summary: ApplicationSummary) => void;
  onCancel: () => void;
}) {
  const { m } = useI18n();
  const t = m.paymentSetup;
  const [values, setValues] = useState<Values>({
    businessType: "exempt",
    legalName: defaults.fullName,
    idNumber: "",
    phone: defaults.phone,
    email: defaults.email,
    street: "",
    city: "",
    bankCode: "",
    branchCode: "",
    accountNumber: "",
    accountHolder: defaults.fullName,
    monthlyVolumeIls: "",
    acceptTerms: false,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((prev) => ({ ...prev, [key]: value }));

  async function submit() {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch("/api/me/payment-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await res.json()) as { application?: ApplicationSummary; error?: string; fieldErrors?: Record<string, string> };
      if (!res.ok || !data.application) {
        setError(data.error ?? t.errors.failed);
        setFieldErrors(data.fieldErrors ?? {});
        return;
      }
      onDone(data.application);
    } catch {
      setError(t.errors.failed);
    } finally {
      setBusy(false);
    }
  }

  const field = (name: keyof Values, label: string, opts: { ltr?: boolean; inputMode?: "numeric" | "email" | "tel"; help?: string } = {}) => (
    <div className="flex flex-col gap-1 text-start">
      <Label htmlFor={`pa-${name}`} className="text-xs">
        {label}
      </Label>
      <Input
        id={`pa-${name}`}
        dir={opts.ltr ? "ltr" : undefined}
        inputMode={opts.inputMode}
        autoComplete="off"
        value={String(values[name] ?? "")}
        onChange={(e) => set(name, e.target.value as never)}
        aria-invalid={!!fieldErrors[name]}
      />
      {opts.help && <p className="text-muted-foreground text-xs">{opts.help}</p>}
      {fieldErrors[name] && <p className="text-destructive text-xs">{fieldErrors[name]}</p>}
    </div>
  );

  return (
    <form
      className="border-border flex min-w-0 flex-col gap-4 rounded-md border p-3 text-start"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t.formTitle}</p>
        <p className="text-muted-foreground text-xs">{t.formLead}</p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-xs font-semibold">{t.sectionBusiness}</legend>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pa-businessType" className="text-xs">
            {t.businessType}
          </Label>
          <select
            id="pa-businessType"
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            value={values.businessType}
            onChange={(e) => set("businessType", e.target.value as BusinessType)}
          >
            {BUSINESS_TYPES.map((type) => (
              <option key={type} value={type}>
                {t.businessTypes[type]}
              </option>
            ))}
          </select>
        </div>
        {field("legalName", t.legalName, { help: t.legalNameHelp })}
        {field("idNumber", t.idNumber, { ltr: true, inputMode: "numeric" })}
        <div className="grid gap-3 sm:grid-cols-2">
          {field("phone", t.phone, { ltr: true, inputMode: "tel" })}
          {field("email", t.email, { ltr: true, inputMode: "email" })}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("street", t.street)}
          {field("city", t.city)}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-xs font-semibold">{t.sectionBank}</legend>
        <div className="grid grid-cols-3 gap-3">
          {field("bankCode", t.bankCode, { ltr: true, inputMode: "numeric" })}
          {field("branchCode", t.branchCode, { ltr: true, inputMode: "numeric" })}
          {field("accountNumber", t.accountNumber, { ltr: true, inputMode: "numeric" })}
        </div>
        {field("accountHolder", t.accountHolder)}
        {field("monthlyVolumeIls", t.monthlyVolume, { ltr: true, inputMode: "numeric" })}
      </fieldset>

      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary mt-1 size-4"
            checked={values.acceptTerms}
            onChange={(e) => set("acceptTerms", e.target.checked)}
          />
          <span>
            {t.acceptTerms}{" "}
            <a href="/terms#payments" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
              {t.termsLink}
            </a>
            , {t.acceptTermsFee(feePct)}
          </span>
        </label>
        {fieldErrors.acceptTerms && <p className="text-destructive text-xs">{fieldErrors.acceptTerms}</p>}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={busy}>
          {busy ? t.submitting : t.submit}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}
