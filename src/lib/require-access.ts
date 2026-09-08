import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { accessState, canWrite } from "@/lib/access";

/**
 * The 402 that guards every write a therapist makes from the dashboard.
 *
 * Reads are never guarded: a locked dashboard is read-only, not dark. Public
 * routes — the booking page, manage links, the cron — never call this.
 * Returns the response to send, or null to carry on.
 */
export async function writeBlocked(therapistId: string): Promise<NextResponse | null> {
  const subscription = await prisma.subscription.findUnique({ where: { therapistId } });
  // No row yet (the seconds after sign-up): nothing to lock.
  if (!subscription) return null;
  if (canWrite(accessState(subscription))) return null;
  return NextResponse.json({ error: "subscription_required" }, { status: 402 });
}
