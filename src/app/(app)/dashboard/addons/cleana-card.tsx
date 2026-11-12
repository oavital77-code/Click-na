"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { statusBadgeClass } from "@/lib/status-badge";
import { useI18n } from "@/i18n/client";

/**
 * The link to Cleana (src/lib/cleana-link.ts). Connected from Cleana's side,
 * so this card only shows it and lets the therapist cut it.
 */
export function CleanaCard({ connectedSince }: { connectedSince: string }) {
  const { m } = useI18n();
  const t = m.cleanaLink;
  const [connected, setConnected] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function disconnect() {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/me/integrations/cleana", { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      setConnected(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t.cardTitle}
          {connected && <span className={statusBadgeClass("open")}>{m.addons.connected}</span>}
        </CardTitle>
        <CardDescription>{t.cardLead}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>{connected ? t.connectedSince(connectedSince) : t.notConnected}</span>
        {connected && (
          <Button variant="outline" size="sm" disabled={busy} onClick={disconnect}>
            {t.disconnect}
          </Button>
        )}
        {error && <span className="text-destructive">{m.addons.actionFailed}</span>}
      </CardContent>
    </Card>
  );
}
