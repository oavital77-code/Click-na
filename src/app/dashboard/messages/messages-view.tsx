"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { messageStatusTone, statusBadgeClass } from "@/lib/status-badge";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/dates";
import type { MessageRow } from "@/lib/messages-log";
import type { Messages } from "@/i18n";

type Filter = "all" | "failed";

export function MessagesView({ timezone, messages }: { timezone: string; messages: MessageRow[] }) {
  const { m, locale } = useI18n();
  const g = m.messageLog;
  const [filter, setFilter] = useState<Filter>("all");

  const failedCount = useMemo(() => messages.filter((r) => r.status === "failed").length, [messages]);
  const shown = filter === "failed" ? messages.filter((r) => r.status === "failed") : messages;

  if (messages.length === 0) {
    return <p className="text-muted-foreground text-sm">{g.empty}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* The summary answers the only question this screen exists for, before
          the reader has to scan a single row. */}
      {failedCount > 0 ? (
        <div className="border-st-danger/40 bg-st-danger/8 flex flex-col gap-1 rounded-lg border p-3 text-start">
          <p className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="text-st-danger size-4 shrink-0" />
            {g.someFailed(failedCount)}
          </p>
          <p className="text-muted-foreground text-xs leading-relaxed">{g.failedHelp}</p>
        </div>
      ) : (
        <p className="text-st-open text-sm">{g.allDelivered}</p>
      )}

      {failedCount > 0 && (
        <div className="flex flex-wrap justify-center gap-2 md:justify-start">
          {(["all", "failed"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              variant={filter === value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(value)}
            >
              {value === "all" ? g.filterAll : g.filterFailed}
            </Button>
          ))}
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {shown.map((row) => (
          <li key={row.id}>
            <Card>
              <CardContent className="flex flex-col gap-1.5 text-start">
                <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-medium">
                    {g.type[row.type as keyof Messages["messageLog"]["type"]] ?? row.type}
                    {row.clientName && <span className="text-muted-foreground"> · {row.clientName}</span>}
                  </span>
                  <span className={statusBadgeClass(messageStatusTone(row.status))}>
                    {g.status[row.status as keyof Messages["messageLog"]["status"]] ?? row.status}
                  </span>
                </div>

                <p className="text-muted-foreground text-xs">
                  {g.channel[row.channel as keyof Messages["messageLog"]["channel"]] ?? row.channel}
                  {" · "}
                  <span dir="ltr">{row.recipient}</span>
                  {row.sentAt && ` · ${fmt(row.sentAt, timezone, locale, "dateTime")}`}
                  {!row.sentAt && row.scheduledFor &&
                    ` · ${g.scheduledFor(fmt(row.scheduledFor, timezone, locale, "dateTime"))}`}
                </p>

                {row.sessionStartsAt && (
                  <p className="text-muted-foreground text-xs">
                    {g.forAppointment(fmt(row.sessionStartsAt, timezone, locale, "dateTime"))}
                  </p>
                )}

                {/* The provider's own words. Vague on its own, but it is what a
                    support conversation actually needs. */}
                {row.status === "failed" && row.errorMessage && (
                  <p className="text-st-danger text-xs">
                    {row.errorMessage} · {g.attempts(row.attempts)}
                  </p>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <p className="text-muted-foreground text-xs leading-relaxed">{g.schedule}</p>
    </div>
  );
}
