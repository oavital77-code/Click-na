import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateBookingIcs } from "@/lib/ics";
import { getMessages, toLocale } from "@/i18n";
import { locationLabel } from "@/lib/locations";

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/public/bookings/manage/[token]/ics">
) {
  const { token } = await ctx.params;

  const booking = await prisma.booking.findUnique({
    where: { manageToken: token },
    include: { session: { include: { location: true } }, therapist: true },
  });

  if (!booking || booking.status === "canceled_by_client" || booking.status === "canceled_by_therapist") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const location = booking.meetingUrl ?? locationLabel(booking.session.location);

  const ics = generateBookingIcs({
    uid: booking.id,
    startsAt: booking.session.startsAt,
    endsAt: booking.session.endsAt,
    title: getMessages(toLocale(booking.therapist.locale)).ics.eventTitle(booking.therapist.fullName),
    location,
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="booking.ics"`,
    },
  });
}
