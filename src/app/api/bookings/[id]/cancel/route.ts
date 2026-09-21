import { NextResponse, type NextRequest, after } from "next/server";
import { z } from "zod";
import { cancelBookingByTherapist } from "@/lib/bookings";
import { sendBookingCanceledNotifications } from "@/lib/notifications";
import { requireTherapist } from "@/lib/route-auth";

const bodySchema = z.object({ reason: z.string().trim().max(500).optional() });

const STATUS_BY_ERROR: Record<string, number> = {
  not_found: 404,
  already_canceled: 409,
};

export async function POST(request: NextRequest, ctx: RouteContext<"/api/bookings/[id]/cancel">) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 422 });
  }

  const { id } = await ctx.params;
  const result = await cancelBookingByTherapist(therapist.id, id, parsed.data.reason);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: STATUS_BY_ERROR[result.error] });
  }

  after(() => sendBookingCanceledNotifications(result.bookingId, "therapist"));

  return NextResponse.json({ ok: true });
}
