"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/client";

type Ping = { ok: boolean; mode: "sandbox" | "production"; errorCode?: string };

/** The owner's check that the Rapyd keys work, and the webhook address to register. */
export function RapydCheckCard({ webhookUrl }: { webhookUrl: string }) {
  const { m } = useI18n();
  const t = m.paymentSetup.owner.rapyd;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Ping | null>(null);
  const [copied, setCopied] = useState(false);

  async function check() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/owner/rapyd", { method: "POST" });
      setResult((await res.json()) as Ping);
    } catch {
      setResult({ ok: false, mode: "sandbox", errorCode: "NETWORK" });
    } finally {
      setBusy(false);
    }
  }

  const modeLabel = (mode: Ping["mode"]) => (mode === "production" ? t.modeProduction : t.modeSandbox);

  return (
    <Card className="min-w-0 gap-4 text-center md:text-start">
      <CardHeader>
        <CardTitle className="text-base">{t.title}</CardTitle>
        <CardDescription>{t.lead}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-3">
        <Button type="button" className="self-center md:self-start" disabled={busy} onClick={() => void check()}>
          {busy ? t.checking : t.check}
        </Button>
        {result && (
          <p className={result.ok ? "text-sm" : "text-destructive text-sm"} role="status">
            {result.ok
              ? t.ok(modeLabel(result.mode))
              : result.errorCode === "NOT_CONFIGURED"
                ? t.notConfigured
                : t.failed(result.errorCode ?? "UNKNOWN")}
          </p>
        )}
        <p className="text-muted-foreground text-sm">{t.walletMoved}</p>
        <div className="flex flex-col gap-1 text-start">
          <span className="text-xs font-medium">{t.webhookLabel}</span>
          <div className="flex min-w-0 items-center gap-2">
            <code dir="ltr" className="bg-muted min-w-0 flex-1 truncate rounded px-2 py-1 text-xs">
              {webhookUrl}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(webhookUrl).then(() => setCopied(true));
              }}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? t.copied : t.copy}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
