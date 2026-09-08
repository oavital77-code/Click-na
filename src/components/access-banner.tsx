"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/client";
import type { AccessState } from "@/lib/access";
import { cn } from "@/lib/utils";

/**
 * One line across the top of the dashboard while the subscription needs
 * attention. Nothing while it is simply paid, or during the first three weeks
 * of the trial — a countdown that starts on day one is noise, not information.
 */
export function AccessBanner({ state }: { state: AccessState }) {
  const { m } = useI18n();
  const b = m.billing.banner;

  let text: string | null = null;
  let tone: "info" | "warn" | "danger" = "info";
  switch (state.kind) {
    case "trialing":
      if (state.daysLeft <= 7) text = b.trialing(state.daysLeft);
      break;
    case "grace":
      text = state.reason === "trial_ended" ? b.graceTrial(state.daysLeft) : b.gracePayment(state.daysLeft);
      tone = "warn";
      break;
    case "locked":
      text = b.locked;
      tone = "danger";
      break;
    default:
      break;
  }
  if (!text) return null;

  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center gap-2 border-b px-4 py-2.5 text-sm md:flex-row md:justify-between",
        tone === "info" && "border-st-held bg-st-held-bg text-foreground",
        tone === "warn" && "border-st-booked/45 bg-st-booked-bg text-st-booked",
        tone === "danger" && "border-st-danger/35 bg-st-danger/12 text-st-danger"
      )}
    >
      <span>{text}</span>
      <Link
        href="/dashboard/billing"
        className="inline-flex min-h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        {state.kind === "locked" || state.kind === "grace" ? b.cta : b.details}
      </Link>
    </div>
  );
}
