import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { holdSession, createBooking } from "@/lib/bookings";

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
});
