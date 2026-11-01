import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { holdSession, releaseHold } from "@/lib/bookings";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { tooManyRequests } from "@/lib/http";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/public/sessions/[id]/hold">) {
  // A hold takes a slot off the calendar for everyone else for ten minutes,
  // so the ceiling is what one person could plausibly need in that time
  // (changing their mind a few times), not more: at 30 one address could keep
  // a small therapist's whole week held indefinitely.
  const limit = await checkRateLimit({
    scope: "hold",
    identifier: clientIp(request.headers),
    limit: 6,
    windowMs: 10 * 60 * 1000,
  });
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  const { id } = await ctx.params;
  const result = await holdSession(id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ holdExpiresAt: result.holdExpiresAt.toISOString(), holdToken: result.holdToken });
}

const releaseSchema = z.object({ holdToken: z.string().min(16).max(128) });

/** The holder going back to choose another time: the slot is open again at once, not in ten minutes. */
export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/public/sessions/[id]/hold">) {
  const parsed = releaseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 422 });
  const { id } = await ctx.params;
  const released = await releaseHold(id, parsed.data.holdToken);
  return NextResponse.json({ released });
}
