import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { sendDueReminders } from "@/lib/notifications";
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

  const summary = await sendDueReminders();

  // Trials that ended, grace that ran out, countdown mail — see billing-lifecycle.ts.
  const billing = await runBillingLifecycle();

  // Rate-limit windows are only useful until they close. Swept here rather than
  // on a schedule of their own: the rows are tiny and nothing depends on them
  // disappearing promptly.
  const prunedRateLimits = await pruneRateLimits(new Date(Date.now() - 24 * 60 * 60 * 1000));

  // Empty windows on Israeli holidays, for everyone who closes on them.
  const prunedHolidaySlots = await pruneClosedDaysForEveryone();

  // Anything a person has to act on reaches one, instead of sitting in a
  // response body nobody reads on a schedule.
  const problems = cronProblems({ reminders: summary, billing });
  await sendOpsAlert(problems);

  return NextResponse.json({ ...summary, billing, prunedRateLimits, prunedHolidaySlots, problems });
}
