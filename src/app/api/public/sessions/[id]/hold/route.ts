import { NextResponse, type NextRequest } from "next/server";
import { holdSession } from "@/lib/bookings";
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
