"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statusBadgeClass } from "@/lib/status-badge";
import type { OwnerApplication } from "@/lib/payment-applications";
import type { PaymentApplicationDetails } from "@/lib/payment-application-schema";
import { useI18n } from "@/i18n/client";

const TONE = { pending: "held", active: "open", rejected: "blocked" } as const;

export function OwnerApplicationsView({ initial }: { initial: OwnerApplication[] }) {
  const { m } = useI18n();
  const [applications, setApplications] = useState(initial);
  if (applications.length === 0) {
    return <p className="text-muted-foreground text-sm">{m.paymentSetup.owner.empty}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {applications.map((application) => (
        <ApplicationCard key={application.id} application={application} onChange={setApplications} />
      ))}
    </div>
  );
}

/** The lines PayPlus asks for, in the order their form asks for them. */
function detailRows(d: PaymentApplicationDetails, t: ReturnType<typeof useI18n>["m"]["paymentSetup"]) {
  return [
    [t.businessType, t.businessTypes[d.businessType]],
    [t.legalName, d.legalName],
    [t.idNumber, d.idNumber],
    [t.phone, d.phone],
    [t.email, d.email],
    [t.street, d.street],
    [t.city, d.city],
    [t.bankCode, d.bankCode],
    [t.branchCode, d.branchCode],
    [t.accountNumber, d.accountNumber],
    [t.accountHolder, d.accountHolder],
    ...(d.monthlyVolumeIls ? [[t.monthlyVolume, d.monthlyVolumeIls]] : []),
  ] as [string, string][];
}

function ApplicationCard({
  application: a,
  onChange,
}: {
  application: OwnerApplication;
  onChange: (list: OwnerApplication[]) => void;
}) {
  const { m, locale } = useI18n();
  const t = m.paymentSetup;
  const [creds, setCreds] = useState({ apiKey: "", secretKey: "", paymentPageUid: "" });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale === "he" ? "he-IL" : "en-GB");
  const rows = a.details ? detailRows(a.details, t) : [];

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/owner/payment-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { applications?: OwnerApplication[]; error?: string };
      if (!res.ok || !data.applications) {
        setError(data.error ?? m.addons.actionFailed);
        return;
      }
      onChange(data.applications);
    } catch {
      setError(m.addons.actionFailed);
    } finally {
      setBusy(false);
    }
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(rows.map(([k, v]) => `${k}: ${v}`).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Nothing to recover: the details are on screen and selectable.
    }
  }

  return (
    <Card className="min-w-0 gap-4 text-start">
      <CardHeader className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{a.therapistName}</CardTitle>
          <span className={statusBadgeClass(TONE[a.status])}>{t.owner.status[a.status]}</span>
        </div>
        <p className="text-muted-foreground text-xs" dir="ltr">
          {a.therapistEmail}
        </p>
        <p className="text-muted-foreground text-xs">
          {t.owner.submitted} {date(a.submittedAt)} · {t.owner.terms(a.termsVersion, date(a.termsAcceptedAt))} · {t.owner.fee(a.feePct)}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {a.details ? (
          <div className="flex flex-col gap-2">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={copyAll}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? t.owner.copied : t.owner.copy}
            </Button>
          </div>
        ) : (
          <p className="text-destructive text-sm">{t.owner.unreadable}</p>
        )}

        {a.rejectionReason && a.status === "rejected" && (
          <p className="text-muted-foreground text-sm">{t.rejectedReason(a.rejectionReason)}</p>
        )}

        {a.status === "pending" && (
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <form
              className="border-border flex flex-1 flex-col gap-2 rounded-md border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send({ action: "approve", id: a.id, credentials: creds });
              }}
            >
              <p className="text-sm font-medium">{t.owner.approveTitle}</p>
              {(["apiKey", "secretKey", "paymentPageUid"] as const).map((name) => (
                <div key={name} className="flex flex-col gap-1">
                  <Label htmlFor={`${a.id}-${name}`} className="text-xs">
                    {m.integrations.payplus.fields[name]}
                  </Label>
                  <Input
                    id={`${a.id}-${name}`}
                    dir="ltr"
                    autoComplete="off"
                    type={name === "paymentPageUid" ? "text" : "password"}
                    value={creds[name]}
                    onChange={(e) => setCreds((prev) => ({ ...prev, [name]: e.target.value }))}
                  />
                </div>
              ))}
              <Button type="submit" disabled={busy} className="self-start">
                {busy ? t.owner.approving : t.owner.approve}
              </Button>
            </form>
            <form
              className="flex flex-col gap-2 md:w-64"
              onSubmit={(e) => {
                e.preventDefault();
                if (reason.trim()) void send({ action: "reject", id: a.id, reason });
              }}
            >
              <Input placeholder={t.owner.rejectPlaceholder} value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button type="submit" variant="outline" disabled={busy || !reason.trim()}>
                {t.owner.reject}
              </Button>
            </form>
          </div>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}
      </CardContent>
    </Card>
  );
}
