import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isExclusionViolation } from "@/lib/prisma-errors";
import type { Booking, Prisma, Session } from "@/generated/prisma/client";
import { accessState, acceptsNewBookings } from "@/lib/access";

const HOLD_MINUTES = 10;

class SlotUnavailableError extends Error {}
/** The booking was cancelled or moved by another request while this one ran. */
class BookingChangedError extends Error {}

export type HoldSessionResult =
  | { ok: true; holdExpiresAt: Date; holdToken: string }
  | { ok: false; error: "SLOT_ON_HOLD" | "SLOT_ALREADY_BOOKED" };

/**
 * The 10-minute public hold (spec 7.3/11.1). Only reclaims a slot that's open
 * or held-and-expired — never a live held slot — so two visitors can never
 * hold the same slot at once. The token handed back is what makes the hold
 * the holder's: createBooking accepts a live hold only with it.
 */
export async function holdSession(sessionId: string): Promise<HoldSessionResult> {
  const now = new Date();
  const holdExpiresAt = new Date(now.getTime() + HOLD_MINUTES * 60 * 1000);
  const holdToken = randomBytes(16).toString("hex");

  // The same gates as booking: a hold on a slot that could never be booked
  // only takes it off the calendar for everyone else.
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      startsAt: true,
      therapist: { select: { status: true, settings: { select: { minNoticeHours: true } }, subscription: true } },
    },
  });
  if (!session || session.therapist.status !== "active" || !session.therapist.settings) {
    return { ok: false, error: "SLOT_ALREADY_BOOKED" };
  }
  if (session.therapist.subscription && !acceptsNewBookings(accessState(session.therapist.subscription))) {
    return { ok: false, error: "SLOT_ALREADY_BOOKED" };
  }
  if (session.startsAt.getTime() - now.getTime() < session.therapist.settings.minNoticeHours * 60 * 60 * 1000) {
    return { ok: false, error: "SLOT_ALREADY_BOOKED" };
  }

  const claimed = await prisma.session.updateMany({
    where: {
      id: sessionId,
      location: { archivedAt: null },
      OR: [{ status: "open" }, { status: "held", holdExpiresAt: { lt: now } }],
    },
    data: { status: "held", holdExpiresAt, holdToken },
  });

  if (claimed.count === 0) {
    const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { status: true } });
    return { ok: false, error: session?.status === "booked" ? "SLOT_ALREADY_BOOKED" : "SLOT_ON_HOLD" };
  }

  return { ok: true, holdExpiresAt, holdToken };
}

/**
 * Gives a hold back before it runs out — the visitor went back to pick another
 * time. Only with the token the hold was handed out with, so nobody can free a
 * slot someone else is filling in the form for. Anything else is a no-op.
 */
export async function releaseHold(sessionId: string, holdToken: string): Promise<boolean> {
  const released = await prisma.session.updateMany({
    where: { id: sessionId, status: "held", holdToken },
    data: { status: "open", holdExpiresAt: null, holdToken: null },
  });
  return released.count > 0;
}

/**
 * Who may claim a slot right now: anyone, when it is open or its hold has
 * lapsed; only the holder, while a hold is live. Shared by booking and
 * rescheduling so the two cannot disagree.
 */
function claimableBy(holdToken: string | null | undefined, now: Date): Prisma.SessionWhereInput {
  return {
    // A slot at an archived place is no longer offered, whatever its status.
    location: { archivedAt: null },
    OR: [
      { status: "open" },
      { status: "held", holdExpiresAt: { lt: now } },
      ...(holdToken ? [{ status: "held" as const, holdToken }] : []),
    ],
  };
}

export type CreateBookingInput = {
  fullName: string;
  /** Optional unless the therapist's settings require one (requirePhone). */
  phone?: string | null;
  email: string;
  note?: string;
  /** From holdSession. Needed only while the slot is held; an open slot needs none. */
  holdToken?: string | null;
};

export type CreateBookingResult =
  | { ok: true; booking: Booking; session: Session }
  | { ok: false; error: "THERAPIST_NOT_FOUND" | "BOOKING_TOO_SOON" | "SLOT_ALREADY_BOOKED" | "PHONE_REQUIRED" };

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
    include: { therapist: { include: { settings: true, subscription: true } } },
  });

  if (!session || session.therapist.status !== "active" || !session.therapist.settings) {
    return { ok: false, error: "THERAPIST_NOT_FOUND" };
  }
  // Cancelled and run out: closed to new bookings, same as the page says.
  if (session.therapist.subscription && !acceptsNewBookings(accessState(session.therapist.subscription))) {
    return { ok: false, error: "THERAPIST_NOT_FOUND" };
  }

  const minNoticeMs = session.therapist.settings.minNoticeHours * 60 * 60 * 1000;
  if (session.startsAt.getTime() - Date.now() < minNoticeMs) {
    return { ok: false, error: "BOOKING_TOO_SOON" };
  }

  // The phone is the therapist's call, not the schema's: the booking form
  // hides the asterisk when they switched the requirement off, so the server
  // has to accept what the form allowed.
  const phone = input.phone?.trim() || null;
  if (session.therapist.settings.requirePhone && (!phone || phone.length < 7)) {
    return { ok: false, error: "PHONE_REQUIRED" };
  }

  try {
    const booking = await prisma.$transaction(async (tx) => {
      // Whoever wins this update owns the slot; anything else (already booked,
      // blocked, held by somebody else) is a conflict.
      const claimed = await tx.session.updateMany({
        where: { id: sessionId, ...claimableBy(input.holdToken, new Date()) },
        data: { status: "booked", holdToken: null },
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
          phone,
        },
        // Nothing on the record changes from here: this form needs no login,
        // so whoever knows a client's email could otherwise rename them or
        // swap their phone. The booking keeps what was typed (its snapshot).
        update: {},
      });

      await tx.client.update({
        where: { id: client.id },
        // Only a missing phone is filled in, never an existing one replaced.
        data: { totalBookings: { increment: 1 }, ...(phone && !client.phone ? { phone } : {}) },
      });

      return tx.booking.create({
        data: {
          therapistId: session.therapistId,
          sessionId,
          clientId: client.id,
          clientNameSnapshot: input.fullName,
          clientEmailSnapshot: input.email,
          clientPhoneSnapshot: phone,
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
  | { ok: true; bookingId: string }
  | { ok: false; error: "not_found" | "already_canceled" | "CANCELLATION_WINDOW_PASSED" };

/**
 * A cancelled booking's hour, free again. The booking keeps its own session
 * row, marked canceled, as the record of what was booked; the hour comes back
 * as a fresh open session. Reopening the same row instead left the canceled
 * booking attached to it, so the hour could be neither booked again (one
 * booking per session) nor deleted (the booking points at it).
 */
async function releaseSlot(tx: Prisma.TransactionClient, sessionId: string) {
  const old = await tx.session.update({
    where: { id: sessionId },
    data: { status: "canceled", holdToken: null, holdExpiresAt: null },
    include: { location: { select: { archivedAt: true } }, generatedFromRule: { select: { isActive: true } } },
  });
  // The hour comes back only where the therapist still offers it: not at a
  // place since archived, not from a weekly rule since switched off.
  if (old.location.archivedAt !== null) return;
  if (old.generatedFromRule && !old.generatedFromRule.isActive) return;
  await tx.session.create({
    data: {
      therapistId: old.therapistId,
      startsAt: old.startsAt,
      endsAt: old.endsAt,
      locationId: old.locationId,
      generatedFromRuleId: old.generatedFromRuleId,
      status: "open",
    },
  });
}

/**
 * Locks a live booking for the rest of the transaction and returns its
 * current session, or null when it is already cancelled. Everything that
 * moves or cancels a booking goes through this, so a cancel and a reschedule
 * (or two cancels from a double click) take turns instead of interleaving.
 */
async function lockLiveBooking(tx: Prisma.TransactionClient, bookingId: string): Promise<string | null> {
  const rows = await tx.$queryRaw<{ session_id: string }[]>`
    SELECT session_id FROM bookings
    WHERE id = ${bookingId}::uuid AND status NOT IN ('canceled_by_client', 'canceled_by_therapist')
    FOR UPDATE`;
  return rows[0]?.session_id ?? null;
}

function isAlreadyCanceled(status: string) {
  return status === "canceled_by_client" || status === "canceled_by_therapist";
}

export type ConfirmResult =
  | { ok: true; bookingId: string }
  | { ok: false; error: "not_found" | "not_pending" };

/**
 * The therapist's "yes" to a booking that came in while auto-confirm was off.
 * Until now a pending booking had no way out of pending: the switch existed,
 * the door behind it did not.
 */
export async function confirmBookingByTherapist(therapistId: string, bookingId: string): Promise<ConfirmResult> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { therapistId: true, status: true } });
  if (!booking || booking.therapistId !== therapistId) {
    return { ok: false, error: "not_found" };
  }
  if (booking.status !== "pending") {
    return { ok: false, error: "not_pending" };
  }
  // Conditional on the status, so two clicks (or a click racing a
  // cancellation) cannot confirm something that is no longer pending.
  const updated = await prisma.booking.updateMany({
    where: { id: bookingId, therapistId, status: "pending" },
    data: { status: "confirmed" },
  });
  if (updated.count === 0) return { ok: false, error: "not_pending" };
  return { ok: true, bookingId };
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

  const done = await prisma.$transaction(async (tx) => {
    const sessionId = await lockLiveBooking(tx, bookingId);
    if (!sessionId) return false;
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: "canceled_by_therapist", canceledAt: new Date(), cancellationReason: reason || null },
    });
    await releaseSlot(tx, sessionId);
    return true;
  });
  if (!done) return { ok: false, error: "already_canceled" };

  return { ok: true, bookingId: booking.id };
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

  const done = await prisma.$transaction(async (tx) => {
    const sessionId = await lockLiveBooking(tx, booking.id);
    if (!sessionId) return false;
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: "canceled_by_client", canceledAt: new Date() },
    });
    await releaseSlot(tx, sessionId);
    return true;
  });
  if (!done) return { ok: false, error: "already_canceled" };

  return { ok: true, bookingId: booking.id };
}

export type RescheduleResult =
  | { ok: true; bookingId: string; startsAt: Date; endsAt: Date }
  | {
      ok: false;
      error:
        | "not_found"
        | "already_canceled"
        | "CANCELLATION_WINDOW_PASSED"
        | "SLOT_ALREADY_BOOKED"
        | "BOOKING_TOO_SOON";
    };

/**
 * Client-side reschedule (spec 7.4/9.2) — moves the same booking to a different
 * open session for the same therapist. Gated by the same cancellation-policy
 * window as cancel (spec doesn't separate the two), plus the new slot's own
 * min-notice check.
 */
export async function rescheduleBookingByClient(
  manageToken: string,
  newSessionId: string
): Promise<RescheduleResult> {
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

  const newSession = await prisma.session.findUnique({ where: { id: newSessionId } });
  if (!newSession || newSession.therapistId !== booking.therapistId) {
    return { ok: false, error: "not_found" };
  }

  const minNoticeMs = (booking.therapist.settings?.minNoticeHours ?? 12) * 60 * 60 * 1000;
  if (newSession.startsAt.getTime() - Date.now() < minNoticeMs) {
    return { ok: false, error: "BOOKING_TOO_SOON" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Cancelled meanwhile, or already moved by another request: stop here.
      const currentSessionId = await lockLiveBooking(tx, booking.id);
      if (currentSessionId !== booking.sessionId) throw new BookingChangedError();
      const claimed = await tx.session.updateMany({
        where: { id: newSessionId, ...claimableBy(null, new Date()) },
        data: { status: "booked", holdToken: null },
      });
      if (claimed.count === 0) {
        throw new SlotUnavailableError();
      }

      await tx.session.update({ where: { id: booking.sessionId }, data: { status: "open" } });
      await tx.booking.update({ where: { id: booking.id }, data: { sessionId: newSessionId } });
    });
  } catch (error) {
    if (error instanceof BookingChangedError) return { ok: false, error: "already_canceled" };
    if (error instanceof SlotUnavailableError || isExclusionViolation(error)) {
      return { ok: false, error: "SLOT_ALREADY_BOOKED" };
    }
    throw error;
  }

  return { ok: true, bookingId: booking.id, startsAt: newSession.startsAt, endsAt: newSession.endsAt };
}
