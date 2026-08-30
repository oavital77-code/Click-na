import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isExclusionViolation } from "@/lib/prisma-errors";

const bookingSchema = z.object({
  sessionId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(255),
  phone: z.string().trim().min(7).max(50),
  email: z.string().trim().toLowerCase().email().max(255),
  note: z.string().trim().max(200).optional(),
});

export async function POST(request: NextRequest) {
  const parsed = bookingSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });
  }
  const data = parsed.data;

  const session = await prisma.session.findUnique({
    where: { id: data.sessionId },
    include: { therapist: { include: { settings: true } } },
  });

  if (!session || session.therapist.status !== "active" || !session.therapist.settings) {
    return NextResponse.json({ error: "THERAPIST_NOT_FOUND" }, { status: 404 });
  }

  const now = new Date();
  const minNoticeMs = session.therapist.settings.minNoticeHours * 60 * 60 * 1000;
  if (session.startsAt.getTime() - now.getTime() < minNoticeMs) {
    return NextResponse.json({ error: "BOOKING_TOO_SOON" }, { status: 422 });
  }

  try {
    const booking = await prisma.$transaction(async (tx) => {
      // Whoever wins this update owns the slot; anything else (already booked, blocked, etc.) is a conflict.
      const claimed = await tx.session.updateMany({
        where: { id: data.sessionId, status: { in: ["open", "held"] } },
        data: { status: "booked" },
      });
      if (claimed.count === 0) {
        throw new SlotUnavailableError();
      }

      const client = await tx.client.upsert({
        where: { therapistId_email: { therapistId: session.therapistId, email: data.email } },
        create: {
          therapistId: session.therapistId,
          fullName: data.fullName,
          email: data.email,
          phone: data.phone,
        },
        update: { fullName: data.fullName, phone: data.phone },
      });

      await tx.client.update({
        where: { id: client.id },
        data: { totalBookings: { increment: 1 } },
      });

      return tx.booking.create({
        data: {
          therapistId: session.therapistId,
          sessionId: data.sessionId,
          clientId: client.id,
          clientNameSnapshot: data.fullName,
          clientEmailSnapshot: data.email,
          clientPhoneSnapshot: data.phone,
          clientNote: data.note || null,
          manageToken: randomBytes(32).toString("hex"),
          status: session.therapist.settings!.autoConfirm ? "confirmed" : "pending",
        },
      });
    });

    return NextResponse.json(
      {
        booking: {
          manageToken: booking.manageToken,
          startsAt: session.startsAt.toISOString(),
          endsAt: session.endsAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof SlotUnavailableError || isExclusionViolation(error)) {
      return NextResponse.json({ error: "SLOT_ALREADY_BOOKED" }, { status: 409 });
    }
    throw error;
  }
}

class SlotUnavailableError extends Error {}
