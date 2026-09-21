import { NextResponse, type NextRequest } from "next/server";
import { confirmBookingByTherapist } from "@/lib/bookings";
import { requireTherapist } from "@/lib/route-auth";

const STATUS_BY_ERROR: Record<string, number> = {
  not_found: 404,
  not_pending: 409,
};

/** The therapist confirms a booking that came in while auto-confirm was off. */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/bookings/[id]/confirm">) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  const { id } = await ctx.params;
  const result = await confirmBookingByTherapist(therapist.id, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: STATUS_BY_ERROR[result.error] });
  }
  return NextResponse.json({ ok: true });
}
