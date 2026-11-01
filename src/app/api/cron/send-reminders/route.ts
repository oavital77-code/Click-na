import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { REMINDER_BATCH, sendDueReminders } from "@/lib/notifications";
import { pruneRateLimits } from "@/lib/rate-limit";
import { pruneClosedDaysForEveryone } from "@/lib/holiday-slots";
import { runBillingLifecycle } from "@/lib/billing-lifecycle";
import { cronProblems } from "@/lib/cron-health";
import { sendOpsAlert } from "@/lib/account-emails";

/**
 * Constant-time check of the bearer header. Both sides go through SHA-256 first
 * so timingSafeEqual always compares equal-length buffers — otherwise the
 * secret's length would leak through the early length mismatch, and a plain
 * `!==` leaks its prefix byte by byte through response timing.
 */
function isAuthorized(header: string | null, secret: string): boolean {
  if (!header) return false;
  const provided = createHash("sha256").update(header).digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(provided, expected);
}

// The longest a plan allows without erroring the build on Hobby; raise on Pro.
export const maxDuration = 60;
/** Reminder batches stop starting after this, leaving the rest of the minute to finish. */
const REMINDER_TIME_BUDGET_MS = 35_000;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Without a secret this endpoint is callable by anyone, who could drain the
    // email quota by hitting it repeatedly. Stay open only outside production,
    // where calling it unauthenticated is a documented convenience.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "cron_secret_not_configured" }, { status: 503 });
    }
  } else if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  // ?scope=reminders: the hourly call (an external scheduler, see
  // .github/workflows/hourly-reminders.yml) sends reminders only. Billing,
  // pruning and the full ops alert stay with the once-a-day Vercel cron.
  const remindersOnly = request.nextUrl.searchParams.get("scope") === "reminders";
  // Each step on its own: one that throws (a database hiccup, a provider
  // outage) is reported and the rest still run, including the alert itself.
  const stepProblems: string[] = [];
  async function step<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      console.error(`[cron] ${name} failed`, error);
      stepProblems.push(`${name} failed: ${error instanceof Error ? error.message : String(error)}`);
      return fallback;
    }
  }

  const noBilling = {
    reminders: 0,
    ended: 0,
    locked: 0,
    unconfirmed: 0,
    renewalReminders: 0,
    renewals: { charged: 0, declined: 0, errors: 0, noToken: 0 },
  };
  // Money first: trials that ended, grace that ran out, renewals, countdown
  // mail — see billing-lifecycle.ts.
  const billing = remindersOnly ? noBilling : await step("billing", () => runBillingLifecycle(), noBilling);

  // Reminders in batches while the run has time: a full batch means more may
  // be waiting, and what is left over would otherwise wait a whole day.
  const summary = { sent: 0, failed: 0 };
  for (let round = 0; round < 10 && Date.now() - started < REMINDER_TIME_BUDGET_MS; round++) {
    const batch = await step("reminders", () => sendDueReminders(), { sent: 0, failed: 0 });
    summary.sent += batch.sent;
    summary.failed += batch.failed;
    if (batch.sent + batch.failed < REMINDER_BATCH) break;
  }

  // Rate-limit windows are only useful until they close. Swept here rather than
  // on a schedule of their own: the rows are tiny and nothing depends on them
  // disappearing promptly.
  if (remindersOnly) {
    const problems = [...stepProblems, ...cronProblems({ reminders: summary, billing })];
    await step("ops alert", () => sendOpsAlert(problems), undefined);
    return NextResponse.json({ ...summary, scope: "reminders", problems });
  }

  const prunedRateLimits = await step("rate-limit prune", () => pruneRateLimits(new Date(Date.now() - 24 * 60 * 60 * 1000)), 0);

  // Empty windows on Israeli holidays, for everyone who closes on them.
  const prunedHolidaySlots = await step("holiday prune", () => pruneClosedDaysForEveryone(), 0);

  // Anything a person has to act on reaches one, instead of sitting in a
  // response body nobody reads on a schedule.
  const problems = [...stepProblems, ...cronProblems({ reminders: summary, billing })];
  await step("ops alert", () => sendOpsAlert(problems), undefined);

  return NextResponse.json({ ...summary, billing, prunedRateLimits, prunedHolidaySlots, problems });
}
