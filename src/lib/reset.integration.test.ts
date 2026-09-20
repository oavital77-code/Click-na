import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ensureDefaultLocation } from "@/lib/locations";
import { SlotNotDeletableError, deleteSlot, resetSchedule } from "@/lib/reset";
import { createBooking } from "@/lib/bookings";

describe("reset (against a live database)", () => {
  const therapistIds: string[] = [];

  async function makeTherapist() {
    const therapist = await prisma.therapist.create({
      data: {
        email: `reset-${Date.now()}-${Math.random()}@example.com`,
        fullName: "אור אביטל",
        slug: `reset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        subscription: { create: {} },
        settings: { create: { minNoticeHours: 1 } },
      },
    });
    therapistIds.push(therapist.id);
    return therapist.id;
  }

  async function makeSession(therapistId: string, status: "open" | "blocked", hours = 48) {
    return prisma.session.create({
      data: {
        therapistId,
        locationId: (await ensureDefaultLocation(therapistId)).id,
        startsAt: new Date(Date.now() + hours * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + (hours + 1) * 60 * 60 * 1000),
        status,
      },
    });
  }

  async function makeBooking(therapistId: string) {
    const session = await makeSession(therapistId, "open", 72);
    const result = await createBooking(session.id, {
      fullName: "דנה לוי",
      email: `dana-${session.id}@example.com`,
      phone: "0501234567",
    });
    if (!result.ok) throw new Error("setup failed");
    return result.booking;
  }

  afterEach(async () => {
    for (const therapistId of therapistIds.splice(0)) {
      await prisma.notification.deleteMany({ where: { booking: { therapistId } } });
      await prisma.booking.deleteMany({ where: { therapistId } });
      await prisma.client.deleteMany({ where: { therapistId } });
      await prisma.session.deleteMany({ where: { therapistId } });
      await prisma.availabilityRule.deleteMany({ where: { therapistId } });
      await prisma.location.deleteMany({ where: { therapistId } });
      await prisma.therapistSettings.deleteMany({ where: { therapistId } });
      await prisma.subscription.deleteMany({ where: { therapistId } });
      await prisma.therapist.deleteMany({ where: { id: therapistId } });
    }
  });

  it("deletes a single open slot", async () => {
    const therapistId = await makeTherapist();
    const session = await makeSession(therapistId, "open");

    expect(await deleteSlot(therapistId, session.id)).not.toBeNull();
    expect(await prisma.session.findUnique({ where: { id: session.id } })).toBeNull();
  });

  it("deletes a blocked slot too", async () => {
    const therapistId = await makeTherapist();
    const session = await makeSession(therapistId, "blocked");

    await deleteSlot(therapistId, session.id);
    expect(await prisma.session.findUnique({ where: { id: session.id } })).toBeNull();
  });

  // Deleting the row would strand the client's booking and the confirmation
  // email they are already holding.
  it("refuses to delete a booked slot", async () => {
    const therapistId = await makeTherapist();
    const booking = await makeBooking(therapistId);

    await expect(deleteSlot(therapistId, booking.sessionId)).rejects.toBeInstanceOf(
      SlotNotDeletableError
    );
    expect(await prisma.session.findUnique({ where: { id: booking.sessionId } })).not.toBeNull();
  });

  // The therapist id comes from the session, never the request, so this is the
  // guard against deleting someone else's calendar by guessing an id.
  it("refuses to delete another therapist's slot", async () => {
    const owner = await makeTherapist();
    const stranger = await makeTherapist();
    const session = await makeSession(owner, "open");

    expect(await deleteSlot(stranger, session.id)).toBeNull();
    expect(await prisma.session.findUnique({ where: { id: session.id } })).not.toBeNull();
  });

  it("returns null for a session that does not exist", async () => {
    const therapistId = await makeTherapist();
    expect(await deleteSlot(therapistId, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  describe('scope "slots"', () => {
    it("clears every open and blocked window", async () => {
      const therapistId = await makeTherapist();
      await makeSession(therapistId, "open");
      await makeSession(therapistId, "open", 96);
      await makeSession(therapistId, "blocked", 120);

      const summary = await resetSchedule(therapistId, "slots");

      expect(summary.sessions).toBe(3);
      expect(await prisma.session.count({ where: { therapistId } })).toBe(0);
    });

    it("leaves real appointments and their clients alone", async () => {
      const therapistId = await makeTherapist();
      const booking = await makeBooking(therapistId);
      await makeSession(therapistId, "open");

      const summary = await resetSchedule(therapistId, "slots");

      expect(summary.sessions).toBe(1);
      expect(summary.bookings).toBe(0);
      expect(await prisma.booking.count({ where: { therapistId } })).toBe(1);
      expect(await prisma.session.findUnique({ where: { id: booking.sessionId } })).not.toBeNull();
      expect(await prisma.client.count({ where: { therapistId } })).toBe(1);
    });

    // Leaving them would refill the calendar the moment slots are generated again.
    it("removes the recurring rules that would regenerate the windows", async () => {
      const therapistId = await makeTherapist();
      await prisma.availabilityRule.create({
        data: {
          therapistId,
          locationId: (await ensureDefaultLocation(therapistId)).id,
          dayOfWeek: 1,
          startTime: new Date("1970-01-01T09:00:00Z"),
          endTime: new Date("1970-01-01T17:00:00Z"),
          slotDurationMinutes: 50,
        },
      });

      const summary = await resetSchedule(therapistId, "slots");

      expect(summary.rules).toBe(1);
      expect(await prisma.availabilityRule.count({ where: { therapistId } })).toBe(0);
    });

    it("also clears windows already in the past", async () => {
      const therapistId = await makeTherapist();
      await makeSession(therapistId, "open", -240);

      await resetSchedule(therapistId, "slots");
      expect(await prisma.session.count({ where: { therapistId } })).toBe(0);
    });
  });

  describe('scope "everything"', () => {
    it("removes appointments, clients and notifications as well", async () => {
      const therapistId = await makeTherapist();
      await makeBooking(therapistId);
      await makeSession(therapistId, "open");

      const summary = await resetSchedule(therapistId, "everything");

      expect(summary.bookings).toBe(1);
      expect(summary.clients).toBe(1);
      expect(await prisma.session.count({ where: { therapistId } })).toBe(0);
      expect(await prisma.booking.count({ where: { therapistId } })).toBe(0);
      expect(await prisma.client.count({ where: { therapistId } })).toBe(0);
    });

    // The therapist keeps their account, settings and public link — this is a
    // reset of the calendar, not of the business.
    it("keeps the therapist, their settings and their link", async () => {
      const therapistId = await makeTherapist();
      await makeBooking(therapistId);

      await resetSchedule(therapistId, "everything");

      expect(await prisma.therapist.findUnique({ where: { id: therapistId } })).not.toBeNull();
      expect(
        await prisma.therapistSettings.findUnique({ where: { therapistId } })
      ).not.toBeNull();
    });

    it("touches nothing belonging to another therapist", async () => {
      const mine = await makeTherapist();
      const theirs = await makeTherapist();
      await makeBooking(theirs);
      await makeSession(theirs, "open");
      await makeSession(mine, "open");

      await resetSchedule(mine, "everything");

      expect(await prisma.session.count({ where: { therapistId: theirs } })).toBe(2);
      expect(await prisma.booking.count({ where: { therapistId: theirs } })).toBe(1);
    });

    it("is safe to run on an already-empty account", async () => {
      const therapistId = await makeTherapist();
      await expect(resetSchedule(therapistId, "everything")).resolves.toMatchObject({
        sessions: 0,
        bookings: 0,
      });
    });
  });
});
