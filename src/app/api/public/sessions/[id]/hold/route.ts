import { NextResponse, type NextRequest } from "next/server";
import { holdSession } from "@/lib/bookings";

export async function POST(_request: NextRequest, ctx: RouteContext<"/api/public/sessions/[id]/hold">) {
  const { id } = await ctx.params;
  const result = await holdSession(id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ holdExpiresAt: result.holdExpiresAt.toISOString() });
}
