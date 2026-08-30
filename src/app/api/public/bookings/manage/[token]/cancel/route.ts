import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  ctx: RouteContext<"/api/public/bookings/manage/[token]/cancel">
) {
  const { token } = await ctx.params;

  const booking = await prisma.booking.findUnique({
    where: { manageToken: token },
    include: { session: true, therapist: { include: { settings: true } } },
  });

  if (!booking) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (booking.status === "canceled_by_client" || booking.status === "canceled_by_therapist") {
    return NextResponse.json({ error: "already_canceled" }, { status: 409 });
  }

  const cancellationPolicyHours = booking.therapist.settings?.cancellationPolicyHours ?? 24;
  const hoursUntilSession = (booking.session.startsAt.getTime() - Date.now()) / (60 * 60 * 1000);
  if (hoursUntilSession < cancellationPolicyHours) {
    return NextResponse.json({ error: "CANCELLATION_WINDOW_PASSED" }, { status: 422 });
  }

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: booking.id },
      data: { status: "canceled_by_client", canceledAt: new Date() },
    }),
    prisma.session.update({
      where: { id: booking.sessionId },
      data: { status: "open" },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
