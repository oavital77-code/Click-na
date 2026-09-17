"use client";

import { useState } from "react";
import {
  Apple,
  CalendarDays,
  CalendarPlus,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Link2,
  MessageCircle,
  Video,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { statusBadgeClass } from "@/lib/status-badge";
import { subscribeLinks } from "@/lib/calendar-subscribe";
import { cn } from "@/lib/utils";
import type { IntegrationCard, IntegrationProvider } from "@/lib/integrations";
import { PAYMENT_PROVIDERS } from "@/lib/integration-providers";
import { useI18n } from "@/i18n/client";

const ICONS: Record<IntegrationProvider, LucideIcon> = {
  calendar: CalendarDays,
  zoom: Video,
  whatsapp: MessageCircle,
  payplus: CreditCard,
  paymentLink: Link2,
};

const PAYMENT: ReadonlySet<string> = new Set(PAYMENT_PROVIDERS);

type Payload = { integrations: IntegrationCard[]; credentialStorageReady: boolean };

export function AddonsView({
  initial,
  hasTreatments,
}: {
  initial: Payload;
  /** Whether Settings has any treatment. Requests are picked from that menu. */
  hasTreatments: boolean;
}) {
  const { m } = useI18n();
  const [payload, setPayload] = useState(initial);
  const general = payload.integrations.filter((i) => !PAYMENT.has(i.provider));
  const payments = payload.integrations.filter((i) => PAYMENT.has(i.provider));

  return (
    <div className="flex flex-col gap-6">
      {!payload.credentialStorageReady && (
        <div className="border-st-held/50 bg-st-held/10 flex flex-col gap-1 rounded-md border p-3 text-sm">
          <p className="font-medium">{m.addons.setupBannerTitle}</p>
          <p className="text-muted-foreground">
            {m.addons.setupBannerBefore}{" "}
            <span dir="ltr" className="font-mono text-xs">
              INTEGRATION_ENCRYPTION_KEY
            </span>{" "}
            {m.addons.setupBannerAfter}
          </p>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {general.map((integration) => (
          <AddonCard key={integration.provider} integration={integration} onChange={setPayload} />
        ))}
      </div>

      {/* Taking money is one decision, so the two ways of doing it sit together
          under one heading rather than scattered among the other add-ons. */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-medium">{m.addons.paymentsTitle}</h2>
          <p className="text-muted-foreground text-sm">{m.addons.paymentsLead}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {payments.map((integration) => (
            <AddonCard
              key={integration.provider}
              integration={integration}
              onChange={setPayload}
              hint={
                integration.state === "connected" && !hasTreatments
                  ? m.addons.templatesMissing
                  : null
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function AddonCard({
  integration,
  onChange,
  hint = null,
}: {
  integration: IntegrationCard;
  onChange: (payload: Payload) => void;
  /** Something the therapist still has to do elsewhere for this add-on to matter. */
  hint?: string | null;
}) {
  const { m } = useI18n();
  const Icon = ICONS[integration.provider];
  const connected = integration.state === "connected";
  const needsCredentials = integration.fields.length > 0;

  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch("/api/me/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as Payload & {
        error?: string;
        fieldErrors?: Record<string, string>;
      };
      if (data.integrations) onChange(data);

      if (!res.ok) {
        setError(data.error ?? m.addons.actionFailed);
        setFieldErrors(data.fieldErrors ?? {});
        return false;
      }
      return true;
    } catch {
      setError(m.addons.actionFailed);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onToggle() {
    if (connected) {
      await send({ action: "disconnect", provider: integration.provider });
      setEditing(false);
      setValues({});
      return;
    }
    // Nothing to fill in (the calendar feed) — flip it straight on.
    if (!needsCredentials) {
      await send({ action: "connect", provider: integration.provider });
      return;
    }
    setEditing((open) => !open);
  }

  async function submit() {
    const ok = await send({
      action: "connect",
      provider: integration.provider,
      credentials: values,
    });
    if (ok) {
      setEditing(false);
      setValues({});
    }
  }

  return (
    // min-w-0: a grid item defaults to min-width:auto, so the long feed URL below
    // would widen the card past the viewport instead of scrolling inside it.
    <Card className="min-w-0 gap-4 text-center md:text-start">
      {/* items-stretch: CardHeader ships items-start, which shrink-wraps each row
          to its widest child and pins it to the inline-start edge — the rows then
          centre inside that narrow box instead of on the card. */}
      <CardHeader className="flex flex-col items-stretch gap-2">
        <div className="flex flex-col items-center gap-2 md:flex-row md:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="text-primary size-5" strokeWidth={1.75} />
            {integration.label}
          </CardTitle>
          <Toggle
            checked={connected}
            busy={busy}
            label={m.addons.toggle(connected, integration.label)}
            onClick={onToggle}
          />
        </div>
        <CardDescription>{integration.summary}</CardDescription>
        {integration.note && (
          <p className="text-muted-foreground text-xs italic">{integration.note}</p>
        )}
      </CardHeader>

      <CardContent className="flex min-w-0 flex-col gap-3">
        {connected && (
          <div className="flex flex-col items-center gap-1 md:items-start">
            <span className={statusBadgeClass("open")}>{m.addons.connected}</span>
            {integration.accountLabel && (
              <span className="text-muted-foreground text-xs">
                {m.addons.account} <span dir="ltr">{integration.accountLabel}</span>
              </span>
            )}
          </div>
        )}

        {connected && integration.feedUrl && <CalendarFeed url={integration.feedUrl} />}

        {connected && hint && (
          <p className="border-st-held/50 bg-st-held/10 rounded-md border p-2 text-xs">{hint}</p>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}

        {!connected && integration.lastError && !error && (
          <p className="text-destructive text-sm">{integration.lastError}</p>
        )}

        {editing && !connected && (
          <CredentialForm
            integration={integration}
            values={values}
            fieldErrors={fieldErrors}
            busy={busy}
            onValueChange={(name, value) => setValues((prev) => ({ ...prev, [name]: value }))}
            onSubmit={submit}
            onCancel={() => {
              setEditing(false);
              setValues({});
              setError(null);
            }}
          />
        )}

        {connected && needsCredentials && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-center md:self-start"
            // Swapping accounts is a disconnect followed by a fresh entry: we hold
            // no plaintext to pre-fill, so the form opens empty rather than
            // pretending the old values are still editable.
            onClick={async () => {
              const ok = await send({ action: "disconnect", provider: integration.provider });
              if (ok) setEditing(true);
            }}
            disabled={busy}
          >
            {m.addons.swapCredentials}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Toggle({
  checked,
  busy,
  label,
  onClick,
}: {
  checked: boolean;
  busy: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={busy}
      onClick={onClick}
      className={cn(
        // after:: the track is 24px tall because that is what a switch should
        // look like, but 24px is not a finger. The pseudo-element extends the
        // hit area to 44px without moving anything on screen.
        "focus-visible:ring-ring/50 relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-[3px] disabled:opacity-50",
        "after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-['']",
        checked ? "bg-primary" : "bg-muted-foreground/30"
      )}
    >
      {/* start-0.5 / translate-x: in RTL the knob has to travel the other way, and
          a logical property can't move it, so the direction is baked into the
          transform via RTL variants. */}
      <span
        className={cn(
          "absolute start-0.5 size-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

function CredentialForm({
  integration,
  values,
  fieldErrors,
  busy,
  onValueChange,
  onSubmit,
  onCancel,
}: {
  integration: IntegrationCard;
  values: Record<string, string>;
  fieldErrors: Record<string, string>;
  busy: boolean;
  onValueChange: (name: string, value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const { m } = useI18n();
  // Guided: one field at a time. The form of empty boxes is what a
  // non-technical person abandons; a single question with its own hint is not.
  const guided = !!integration.guided && integration.fields.length > 1;
  const [stepIdx, setStepIdx] = useState(0);
  const total = integration.fields.length;
  // The server names the field that failed; land on it instead of the last one.
  const failedIdx = integration.fields.findIndex((f) => !!fieldErrors[f.name]);
  const current = guided ? (failedIdx >= 0 && failedIdx < stepIdx ? failedIdx : stepIdx) : -1;
  const visibleFields = guided ? [integration.fields[current]] : integration.fields;
  const lastStep = !guided || current === total - 1;

  return (
    <form
      className="border-border flex min-w-0 flex-col gap-3 rounded-md border p-3 text-center md:text-start"
      onSubmit={(e) => {
        e.preventDefault();
        if (lastStep) onSubmit();
        else setStepIdx(current + 1);
      }}
    >
      {guided && (
        <p className="text-muted-foreground text-xs font-medium">{m.addons.guidedStep(current + 1, total)}</p>
      )}
      <p className="text-muted-foreground text-xs">{integration.setupHint}</p>

      {integration.docsUrl && (!guided || current === 0) && (
        <a
          href={integration.docsUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary inline-flex min-h-11 items-center justify-center gap-1 text-xs hover:underline md:min-h-0 md:justify-start"
        >
          <ExternalLink className="size-3.5" />
          {m.addons.openDocs}
        </a>
      )}

      {visibleFields.map((field) => (
        <div key={field.name} className="flex flex-col gap-1 text-start">
          <Label htmlFor={`${integration.provider}-${field.name}`} className="text-xs">
            {field.label}
          </Label>
          <Input
            id={`${integration.provider}-${field.name}`}
            // Masked so the value isn't left on screen in a shared clinic space,
            // and so browsers don't offer to autofill it somewhere else.
            type={field.secret ? "password" : "text"}
            dir="ltr"
            autoComplete="off"
            placeholder={field.placeholder}
            value={values[field.name] ?? ""}
            onChange={(e) => onValueChange(field.name, e.target.value)}
            aria-invalid={!!fieldErrors[field.name]}
          />
          {field.help && <p className="text-muted-foreground text-xs">{field.help}</p>}
          {fieldErrors[field.name] && (
            <p className="text-destructive text-xs">{fieldErrors[field.name]}</p>
          )}
        </div>
      ))}

      <div className="flex flex-col justify-center gap-2 sm:flex-row md:justify-start">
        <Button type="submit" disabled={busy}>
          {busy ? m.addons.checking : lastStep ? m.addons.saveAndEnable : m.addons.guidedNext}
        </Button>
        {guided && current > 0 && (
          <Button type="button" variant="outline" onClick={() => setStepIdx(current - 1)} disabled={busy}>
            {m.addons.guidedBack}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          {m.common.cancel}
        </Button>
      </div>
    </form>
  );
}

function CalendarFeed({ url }: { url: string }) {
  const { m } = useI18n();
  const [copied, setCopied] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const links = subscribeLinks(url, "Cleana+");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (e.g. an insecure context) — the URL is
      // on screen and selectable, so there is nothing to recover from.
    }
  }

  return (
    <div className="border-border flex min-w-0 flex-col gap-3 rounded-md border p-3 text-center md:text-start">
      <p className="text-sm font-medium">{m.addons.feedTitle}</p>

      <div className="flex flex-col justify-center gap-2 sm:flex-row md:justify-start">
        {/* Opens the calendar app straight onto a subscribe prompt, instead of
            making the therapist find the right settings screen themselves. */}
        <Button asChild variant="outline" size="sm">
          <a href={links.webcal}>
            <Apple className="size-4" />
            {m.addons.apple}
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={links.google} target="_blank" rel="noreferrer noopener">
            <CalendarPlus className="size-4" />
            Google Calendar
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={links.outlook} target="_blank" rel="noreferrer noopener">
            <CalendarPlus className="size-4" />
            Outlook
          </a>
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setShowUrl((open) => !open)}
        className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center self-center text-xs underline underline-offset-4 md:min-h-0 md:self-start"
      >
        {showUrl ? m.addons.hideUrl : m.addons.showUrl}
      </button>

      {showUrl && (
        <div className="flex min-w-0 flex-col gap-2">
          <code
            dir="ltr"
            className="bg-muted text-muted-foreground block overflow-x-auto rounded-sm px-2 py-1.5 text-xs whitespace-nowrap"
          >
            {url}
          </code>
          <div className="flex justify-center md:justify-start">
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? m.link.copied : m.addons.copyUrl}
            </Button>
          </div>
        </div>
      )}

      <p className="text-muted-foreground text-xs">{m.addons.delayNote}</p>
    </div>
  );
}
