import { NextResponse, type NextRequest } from "next/server";
import { holdSession } from "@/lib/bookings";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { tooManyRequests } from "@/lib/http";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/public/sessions/[id]/hold">) {
  // A hold takes a slot off the calendar for everyone else, so an unthrottled
  // caller can empty a therapist's week without ever completing a booking. The
  // ceiling is loose enough that a client changing their mind never meets it.
  const limit = await checkRateLimit({
    scope: "hold",
    identifier: clientIp(request.headers),
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  const { id } = await ctx.params;
  const result = await holdSession(id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ holdExpiresAt: result.holdExpiresAt.toISOString() });
}
