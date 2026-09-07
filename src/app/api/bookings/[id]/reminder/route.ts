import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * Records that the therapist sent this booking's reminder themselves — by
 * tapping the WhatsApp button, which opens their own phone with the message
 * ready. Nothing is sent from here; the row exists so the bookings list can
 * show "reminder sent" and the therapist does not message the same client
 * twice. Same table and shape as the automatic reminders, so one query
 * answers "was this client reminded?" regardless of who pressed send.
 */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/bookings/[id]/reminder">) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({ where: { clerkUserId: userId } });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { id } = await ctx.params;
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking || booking.therapistId !== therapist.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!booking.clientPhoneSnapshot) {
    return NextResponse.json({ error: "no_phone" }, { status: 422 });
  }

  const sentAt = new Date();
  await prisma.notification.create({
    data: {
      therapistId: therapist.id,
      bookingId: booking.id,
      type: "reminder",
      channel: "whatsapp",
      recipient: booking.clientPhoneSnapshot,
      status: "sent",
      sentAt,
      attempts: 1,
    },
  });

  return NextResponse.json({ ok: true, sentAt: sentAt.toISOString() });
}
