import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isExclusionViolation } from "@/lib/prisma-errors";
import type { Booking, Session } from "@/generated/prisma/client";

const HOLD_MINUTES = 10;

class SlotUnavailableError extends Error {}

export type HoldSessionResult =
  | { ok: true; holdExpiresAt: Date }
  | { ok: false; error: "SLOT_ON_HOLD" | "SLOT_ALREADY_BOOKED" };

/**
 * The 10-minute public hold (spec 7.3/11.1). Only reclaims a slot that's open
 * or held-and-expired — never a live held slot — so two visitors can never
 * hold the same slot at once.
 */
export async function holdSession(sessionId: string): Promise<HoldSessionResult> {
  const now = new Date();
  const holdExpiresAt = new Date(now.getTime() + HOLD_MINUTES * 60 * 1000);

  const claimed = await prisma.session.updateMany({
    where: {
      id: sessionId,
      OR: [{ status: "open" }, { status: "held", holdExpiresAt: { lt: now } }],
    },
    data: { status: "held", holdExpiresAt },
  });

  if (claimed.count === 0) {
    const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { status: true } });
    return { ok: false, error: session?.status === "booked" ? "SLOT_ALREADY_BOOKED" : "SLOT_ON_HOLD" };
  }

  return { ok: true, holdExpiresAt };
}

export type CreateBookingInput = {
  fullName: string;
  phone: string;
  email: string;
  note?: string;
};

export type CreateBookingResult =
  | { ok: true; booking: Booking; session: Session }
  | { ok: false; error: "THERAPIST_NOT_FOUND" | "BOOKING_TOO_SOON" | "SLOT_ALREADY_BOOKED" };

/**
 * Claims the session (open or held) and creates the booking in one
 * transaction. therapist_id is always derived from the session row itself,
 * never trusted from the caller (spec 5.3).
 */
export async function createBooking(
  sessionId: string,
  input: CreateBookingInput
): Promise<CreateBookingResult> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { therapist: { include: { settings: true } } },
  });

  if (!session || session.therapist.status !== "active" || !session.therapist.settings) {
    return { ok: false, error: "THERAPIST_NOT_FOUND" };
  }

  const minNoticeMs = session.therapist.settings.minNoticeHours * 60 * 60 * 1000;
  if (session.startsAt.getTime() - Date.now() < minNoticeMs) {
    return { ok: false, error: "BOOKING_TOO_SOON" };
  }

  try {
    const booking = await prisma.$transaction(async (tx) => {
      // Whoever wins this update owns the slot; anything else (already booked, blocked, etc.) is a conflict.
      const claimed = await tx.session.updateMany({
        where: { id: sessionId, status: { in: ["open", "held"] } },
        data: { status: "booked" },
      });
      if (claimed.count === 0) {
        throw new SlotUnavailableError();
      }

      const client = await tx.client.upsert({
        where: { therapistId_email: { therapistId: session.therapistId, email: input.email } },
        create: {
          therapistId: session.therapistId,
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
        },
        update: { fullName: input.fullName, phone: input.phone },
      });

      await tx.client.update({
        where: { id: client.id },
        data: { totalBookings: { increment: 1 } },
      });

      return tx.booking.create({
        data: {
          therapistId: session.therapistId,
          sessionId,
          clientId: client.id,
          clientNameSnapshot: input.fullName,
          clientEmailSnapshot: input.email,
          clientPhoneSnapshot: input.phone,
          clientNote: input.note || null,
          manageToken: randomBytes(32).toString("hex"),
          status: session.therapist.settings!.autoConfirm ? "confirmed" : "pending",
        },
      });
    });

    return { ok: true, booking, session };
  } catch (error) {
    if (error instanceof SlotUnavailableError || isExclusionViolation(error)) {
      return { ok: false, error: "SLOT_ALREADY_BOOKED" };
    }
    throw error;
  }
}

export type CancelResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "already_canceled" | "CANCELLATION_WINDOW_PASSED" };

function isAlreadyCanceled(status: string) {
  return status === "canceled_by_client" || status === "canceled_by_therapist";
}

/** Therapist-side cancellation (spec 9.3, 11.2) — always reopens the slot. */
export async function cancelBookingByTherapist(
  therapistId: string,
  bookingId: string,
  reason?: string
): Promise<CancelResult> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.therapistId !== therapistId) {
    return { ok: false, error: "not_found" };
  }
  if (isAlreadyCanceled(booking.status)) {
    return { ok: false, error: "already_canceled" };
  }

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { status: "canceled_by_therapist", canceledAt: new Date(), cancellationReason: reason || null },
    }),
    prisma.session.update({ where: { id: booking.sessionId }, data: { status: "open" } }),
  ]);

  return { ok: true };
}

/** Client-side cancellation (spec 7.4) — gated by the therapist's cancellation_policy_hours. */
export async function cancelBookingByClient(manageToken: string): Promise<CancelResult> {
  const booking = await prisma.booking.findUnique({
    where: { manageToken },
    include: { session: true, therapist: { include: { settings: true } } },
  });
  if (!booking) {
    return { ok: false, error: "not_found" };
  }
  if (isAlreadyCanceled(booking.status)) {
    return { ok: false, error: "already_canceled" };
  }

  const cancellationPolicyHours = booking.therapist.settings?.cancellationPolicyHours ?? 24;
  const hoursUntilSession = (booking.session.startsAt.getTime() - Date.now()) / (60 * 60 * 1000);
  if (hoursUntilSession < cancellationPolicyHours) {
    return { ok: false, error: "CANCELLATION_WINDOW_PASSED" };
  }

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: booking.id },
      data: { status: "canceled_by_client", canceledAt: new Date() },
    }),
    prisma.session.update({ where: { id: booking.sessionId }, data: { status: "open" } }),
  ]);

  return { ok: true };
}
