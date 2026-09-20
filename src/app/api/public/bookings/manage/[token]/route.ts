import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/public/bookings/manage/[token]">
) {
  const { token } = await ctx.params;

  const booking = await prisma.booking.findUnique({
    where: { manageToken: token },
    include: {
      session: { include: { location: true } },
      therapist: { include: { settings: true } },
    },
  });

  if (!booking) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    booking: {
      status: booking.status,
      startsAt: booking.session.startsAt.toISOString(),
      endsAt: booking.session.endsAt.toISOString(),
      clientName: booking.clientNameSnapshot,
      canceledAt: booking.canceledAt?.toISOString() ?? null,
    },
    location: {
      name: booking.session.location.name,
      type: booking.session.location.type,
      address: booking.session.location.address,
      onlineMeetingUrl: booking.meetingUrl ?? booking.session.location.onlineMeetingUrl,
      notes: booking.session.location.notes,
    },
    therapist: {
      fullName: booking.therapist.fullName,
      cancellationPolicyHours: booking.therapist.settings?.cancellationPolicyHours ?? 24,
      cancellationPolicyText: booking.therapist.settings?.cancellationPolicyText,
      phone: booking.therapist.phone,
    },
  });
}
