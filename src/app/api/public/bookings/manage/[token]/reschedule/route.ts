import { NextResponse, type NextRequest, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rescheduleBookingByClient } from "@/lib/bookings";
import { sendBookingRescheduledNotifications } from "@/lib/notifications";

const bodySchema = z.object({ sessionId: z.string().uuid() });

const STATUS_BY_ERROR: Record<string, number> = {
  not_found: 404,
  already_canceled: 409,
  CANCELLATION_WINDOW_PASSED: 422,
  SLOT_ALREADY_BOOKED: 409,
  BOOKING_TOO_SOON: 422,
};

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/public/bookings/manage/[token]/reschedule">
) {
  const { token } = await ctx.params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 422 });
  }

  // Captured before the mutation so the "moved from X to Y" notification has the old time.
  const before = await prisma.booking.findUnique({
    where: { manageToken: token },
    select: { session: { select: { startsAt: true } } },
  });

  const result = await rescheduleBookingByClient(token, parsed.data.sessionId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: STATUS_BY_ERROR[result.error] });
  }

  if (before) {
    after(() => sendBookingRescheduledNotifications(result.bookingId, before.session.startsAt));
  }

  return NextResponse.json({
    ok: true,
    startsAt: result.startsAt.toISOString(),
    endsAt: result.endsAt.toISOString(),
  });
}
