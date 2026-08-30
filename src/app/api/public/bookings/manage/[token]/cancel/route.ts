import { NextResponse, type NextRequest, after } from "next/server";
import { cancelBookingByClient } from "@/lib/bookings";
import { sendBookingCanceledNotifications } from "@/lib/notifications";

const STATUS_BY_ERROR: Record<string, number> = {
  not_found: 404,
  already_canceled: 409,
  CANCELLATION_WINDOW_PASSED: 422,
};

export async function POST(
  _request: NextRequest,
  ctx: RouteContext<"/api/public/bookings/manage/[token]/cancel">
) {
  const { token } = await ctx.params;
  const result = await cancelBookingByClient(token);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: STATUS_BY_ERROR[result.error] });
  }

  after(() => sendBookingCanceledNotifications(result.bookingId, "client"));

  return NextResponse.json({ ok: true });
}
