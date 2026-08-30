import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  holdSession,
  createBooking,
  cancelBookingByTherapist,
  cancelBookingByClient,
} from "@/lib/bookings";

describe("bookings (against a live database)", () => {
  let therapistId: string;

  beforeAll(async () => {
    const therapist = await prisma.therapist.create({
      data: {
        email: "bookings-integration@example.com",
        fullName: "Bookings Integration",
        slug: "bookings-integration-test",
        subscription: { create: {} },
        settings: { create: { minNoticeHours: 1, cancellationPolicyHours: 24 } },
      },
    });
    therapistId = therapist.id;
  });

  afterEach(async () => {
    await prisma.booking.deleteMany({ where: { therapistId } });
    await prisma.session.deleteMany({ where: { therapistId } });
    await prisma.client.deleteMany({ where: { therapistId } });
  });

  afterAll(async () => {
    await prisma.therapistSettings.deleteMany({ where: { therapistId } });
    await prisma.subscription.deleteMany({ where: { therapistId } });
    await prisma.therapist.deleteMany({ where: { id: therapistId } });
  });

  async function makeSession(hoursFromNow: number) {
    return prisma.session.create({
      data: {
        therapistId,
        startsAt: new Date(Date.now() + hoursFromNow * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + (hoursFromNow + 1) * 60 * 60 * 1000),
      },
    });
  }

  it("holds an open slot", async () => {
    const session = await makeSession(48);
    const result = await holdSession(session.id);
    expect(result.ok).toBe(true);
  });

  it("rejects a second hold on a slot someone else is already holding", async () => {
    const session = await makeSession(48);
    await holdSession(session.id);
    const second = await holdSession(session.id);
    expect(second).toEqual({ ok: false, error: "SLOT_ON_HOLD" });
  });

  it("creates a booking and marks the session booked", async () => {
    const session = await makeSession(48);
    const result = await createBooking(session.id, {
      fullName: "דנה לוי",
      email: "dana@example.com",
      phone: "0501234567",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.booking.manageToken).toHaveLength(64);

    const updated = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(updated.status).toBe("booked");
  });

  it("rejects double-booking the same session", async () => {
    const session = await makeSession(48);
    await createBooking(session.id, { fullName: "First", email: "first@example.com", phone: "0500000001" });
    const second = await createBooking(session.id, {
      fullName: "Second",
      email: "second@example.com",
      phone: "0500000002",
    });
    expect(second).toEqual({ ok: false, error: "SLOT_ALREADY_BOOKED" });
  });

  it("rejects booking a slot inside the min-notice window", async () => {
    const session = await makeSession(0.5); // 30 minutes from now, min notice is 1 hour
    const result = await createBooking(session.id, {
      fullName: "Too Soon",
      email: "soon@example.com",
      phone: "0500000003",
    });
    expect(result).toEqual({ ok: false, error: "BOOKING_TOO_SOON" });
  });

  it("upserts the same client across repeat bookings instead of duplicating", async () => {
    const first = await makeSession(48);
    const second = await makeSession(96);
    await createBooking(first.id, { fullName: "לקוח חוזר", email: "repeat@example.com", phone: "0500000004" });
    await createBooking(second.id, { fullName: "לקוח חוזר", email: "repeat@example.com", phone: "0500000004" });

    const clients = await prisma.client.findMany({ where: { therapistId, email: "repeat@example.com" } });
    expect(clients).toHaveLength(1);
    expect(clients[0].totalBookings).toBe(2);
  });

  it("createBooking accepts a held session regardless of hold expiry (first to commit wins)", async () => {
    // Unlike holdSession, the booking-commit step doesn't check hold_expires_at at all —
    // by the time someone submits the booking form they're already past the hold step,
    // so any 'held' status (their own hold, or someone else's expired one) is claimable here.
    const session = await makeSession(48);
    await prisma.session.update({
      where: { id: session.id },
      data: { status: "held", holdExpiresAt: new Date(Date.now() - 60 * 1000) },
    });
    const result = await createBooking(session.id, {
      fullName: "After Expiry",
      email: "expired@example.com",
      phone: "0500000005",
    });
    expect(result.ok).toBe(true);
  });

  async function makeBooking(hoursFromNow: number) {
    const session = await makeSession(hoursFromNow);
    const result = await createBooking(session.id, {
      fullName: "לקוח",
      email: `cancel-test-${session.id}@example.com`,
      phone: "0500000009",
    });
    if (!result.ok) throw new Error("setup failed");
    return { session, booking: result.booking };
  }

  describe("cancelBookingByTherapist", () => {
    it("cancels and reopens the session", async () => {
      const { session, booking } = await makeBooking(48);
      const result = await cancelBookingByTherapist(therapistId, booking.id, "לא מתאים");
      expect(result).toEqual({ ok: true });

      const updatedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(updatedBooking.status).toBe("canceled_by_therapist");
      expect(updatedBooking.cancellationReason).toBe("לא מתאים");
      expect(updatedBooking.canceledAt).not.toBeNull();

      const updatedSession = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
      expect(updatedSession.status).toBe("open");
    });

    it("rejects canceling twice", async () => {
      const { booking } = await makeBooking(48);
      await cancelBookingByTherapist(therapistId, booking.id);
      const second = await cancelBookingByTherapist(therapistId, booking.id);
      expect(second).toEqual({ ok: false, error: "already_canceled" });
    });

    it("rejects a booking belonging to a different therapist", async () => {
      const { booking } = await makeBooking(48);
      const result = await cancelBookingByTherapist("00000000-0000-0000-0000-000000000000", booking.id);
      expect(result).toEqual({ ok: false, error: "not_found" });

      // Confirm it genuinely wasn't touched.
      const untouched = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(untouched.status).not.toBe("canceled_by_therapist");
    });
  });

  describe("cancelBookingByClient", () => {
    it("cancels and reopens the session when outside the cancellation policy window", async () => {
      // therapist settings above: cancellationPolicyHours = 24; session is 48h away.
      const { session, booking } = await makeBooking(48);
      const result = await cancelBookingByClient(booking.manageToken);
      expect(result).toEqual({ ok: true });

      const updatedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(updatedBooking.status).toBe("canceled_by_client");

      const updatedSession = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
      expect(updatedSession.status).toBe("open");
    });

    it("rejects canceling inside the cancellation policy window", async () => {
      const { booking } = await makeBooking(2); // 2h away, policy is 24h
      const result = await cancelBookingByClient(booking.manageToken);
      expect(result).toEqual({ ok: false, error: "CANCELLATION_WINDOW_PASSED" });

      const untouched = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(untouched.status).not.toBe("canceled_by_client");
    });

    it("rejects an unknown manage token", async () => {
      const result = await cancelBookingByClient("no-such-token");
      expect(result).toEqual({ ok: false, error: "not_found" });
    });

    it("rejects canceling twice", async () => {
      const { booking } = await makeBooking(48);
      await cancelBookingByClient(booking.manageToken);
      const second = await cancelBookingByClient(booking.manageToken);
      expect(second).toEqual({ ok: false, error: "already_canceled" });
    });
  });
});
