"use client";

import { useState } from "react";
import { CalendarDays, Check, Copy, CreditCard, MessageCircle, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { statusBadgeClass, type StatusTone } from "@/lib/status-badge";
import type { IntegrationCard, IntegrationProvider, IntegrationState } from "@/lib/integrations";

const ICONS: Record<IntegrationProvider, LucideIcon> = {
  calendar: CalendarDays,
  zoom: Video,
  payments: CreditCard,
  whatsapp: MessageCircle,
};

const STATE_LABEL: Record<IntegrationState, string> = {
  connected: "מחובר",
  disconnected: "לא מחובר",
  unavailable: "ממתין להגדרת חשבון",
};

const STATE_TONE: Record<IntegrationState, StatusTone> = {
  connected: "open",
  disconnected: "neutral",
  unavailable: "held",
};

export function AddonsView({ initialIntegrations }: { initialIntegrations: IntegrationCard[] }) {
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [busy, setBusy] = useState<IntegrationProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(provider: IntegrationProvider, action: "connect" | "disconnect") {
    setBusy(provider);
    setError(null);
    try {
      const res = await fetch("/api/me/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, action }),
      });
      if (!res.ok) throw new Error("request failed");
      const data = (await res.json()) as { integrations: IntegrationCard[] };
      setIntegrations(data.integrations);
    } catch {
      setError("החיבור נכשל. נסה שוב.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {integrations.map((integration) => (
          <AddonCard
            key={integration.provider}
            integration={integration}
            busy={busy === integration.provider}
            onToggle={toggle}
          />
        ))}
      </div>
    </div>
  );
}

function AddonCard({
  integration,
  busy,
  onToggle,
}: {
  integration: IntegrationCard;
  busy: boolean;
  onToggle: (provider: IntegrationProvider, action: "connect" | "disconnect") => void;
}) {
  const Icon = ICONS[integration.provider];
  const connected = integration.state === "connected";
  const unavailable = integration.state === "unavailable";

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
          <span className={statusBadgeClass(STATE_TONE[integration.state])}>
            {STATE_LABEL[integration.state]}
          </span>
        </div>
        <CardDescription>{integration.summary}</CardDescription>
      </CardHeader>

      <CardContent className="flex min-w-0 flex-col gap-3">
        {connected && integration.feedUrl && <CalendarFeed url={integration.feedUrl} />}

        {unavailable && (
          <div className="bg-muted/60 border-border flex min-w-0 flex-col gap-1 rounded-md border p-3 text-center md:text-start">
            <p className="text-sm font-medium">מה צריך כדי לחבר</p>
            <p className="text-muted-foreground text-sm">{integration.setupHint}</p>
            {/* dir="ltr" keeps the variable names in reading order; text-end then
                lands them on the same side as the Hebrew around them. */}
            <p className="text-muted-foreground text-xs text-end" dir="ltr">
              {integration.missingEnv.join(" · ")}
            </p>
          </div>
        )}

        <div className="flex justify-center md:justify-start">
          <Button
            type="button"
            variant={connected ? "outline" : "default"}
            disabled={unavailable || busy}
            onClick={() => onToggle(integration.provider, connected ? "disconnect" : "connect")}
          >
            {busy ? "רגע..." : connected ? "נתק" : "חבר"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CalendarFeed({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

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
    <div className="border-border flex min-w-0 flex-col gap-2 rounded-md border p-3 text-center md:text-start">
      <p className="text-sm font-medium">כתובת המנוי ליומן</p>
      <code
        dir="ltr"
        className="bg-muted text-muted-foreground block overflow-x-auto rounded-sm px-2 py-1.5 text-xs whitespace-nowrap"
      >
        {url}
      </code>
      <div className="flex justify-center md:justify-start">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "הועתק!" : "העתק כתובת"}
        </Button>
      </div>
      <ul className="text-muted-foreground flex list-inside list-disc flex-col gap-1 text-xs text-start">
        <li>Google Calendar: הוספת יומן ← מכתובת URL ← להדביק.</li>
        <li>אייפון: הגדרות ← אפליקציות ← יומן ← חשבונות ← הוספה ← מנוי ליומן.</li>
        <li>העדכון ביומן אינו מיידי — הוא נמשך פעם בכמה שעות, לפי הגדרות היומן.</li>
      </ul>
    </div>
  );
}
