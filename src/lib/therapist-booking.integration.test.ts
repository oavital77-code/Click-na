import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { bookSlotByTherapist, moveSlot } from "@/lib/bookings";

const at = (hhmm: string) => new Date(`2030-02-10T${hhmm}:00+02:00`);

async function makeTherapist(tag: string) {
  const t = await prisma.therapist.create({
    data: {
      email: `manual-booking-${tag}@example.com`,
      fullName: `Manual Booking ${tag}`,
      slug: `manual-booking-${tag}-test`,
      subscription: { create: {} },
      settings: { create: {} },
      locations: { create: { name: "Clinic", slug: "clinic", color: "#000000" } },
    },
    include: { locations: true },
  });
  return { id: t.id, locationId: t.locations[0].id };
}

describe("the therapist books and moves slots by hand (against a live database)", () => {
  let alice: { id: string; locationId: string };
  let bob: { id: string; locationId: string };

  const slot = (who: { id: string; locationId: string }, from: string, to: string, extra: object = {}) =>
    prisma.session.create({ data: { therapistId: who.id, locationId: who.locationId, startsAt: at(from), endsAt: at(to), ...extra } });

  async function wipe() {
    const ids = [alice?.id, bob?.id].filter(Boolean) as string[];
    await prisma.booking.deleteMany({ where: { therapistId: { in: ids } } });
    await prisma.client.deleteMany({ where: { therapistId: { in: ids } } });
    await prisma.session.deleteMany({ where: { therapistId: { in: ids } } });
  }

  beforeAll(async () => {
    alice = await makeTherapist("alice");
    bob = await makeTherapist("bob");
  });
  beforeEach(wipe);
  afterAll(async () => {
    await wipe();
    const ids = [alice.id, bob.id];
    await prisma.location.deleteMany({ where: { therapistId: { in: ids } } });
    await prisma.therapistSettings.deleteMany({ where: { therapistId: { in: ids } } });
    await prisma.subscription.deleteMany({ where: { therapistId: { in: ids } } });
    await prisma.therapist.deleteMany({ where: { id: { in: ids } } });
  });

  it("books somebody new with only a name, confirmed at once", async () => {
    const s = await slot(alice, "10:00", "11:00");
    const result = await bookSlotByTherapist(alice.id, s.id, { fullName: "  Noa Levi " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.booking).toMatchObject({ status: "confirmed", clientNameSnapshot: "Noa Levi", clientEmailSnapshot: null });
    expect((await prisma.session.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("booked");
    expect(await prisma.client.count({ where: { therapistId: alice.id } })).toBe(1);
  });

  it("books a client from the list, and reuses one by email instead of duplicating", async () => {
    const first = await slot(alice, "10:00", "11:00");
    const second = await slot(alice, "11:00", "12:00");
    const third = await slot(alice, "12:00", "13:00");
    const a = await bookSlotByTherapist(alice.id, first.id, { fullName: "Dana", email: "Dana@Example.com" });
    if (!a.ok) throw new Error("first booking failed");
    expect((await bookSlotByTherapist(alice.id, second.id, { clientId: a.booking.clientId })).ok).toBe(true);
    expect((await bookSlotByTherapist(alice.id, third.id, { fullName: "Dana again", email: "dana@example.com" })).ok).toBe(true);
    const clients = await prisma.client.findMany({ where: { therapistId: alice.id } });
    expect(clients).toHaveLength(1);
    expect(clients[0].totalBookings).toBe(3);
  });

  it("refuses another therapist's slot, and another therapist's client", async () => {
    const mine = await slot(alice, "10:00", "11:00");
    const theirs = await slot(bob, "10:00", "11:00");
    expect(await bookSlotByTherapist(alice.id, theirs.id, { fullName: "Intruder" })).toEqual({ ok: false, error: "not_found" });
    expect((await prisma.session.findUniqueOrThrow({ where: { id: theirs.id } })).status).toBe("open");

    const bobsClient = await prisma.client.create({ data: { therapistId: bob.id, fullName: "Bob's client" } });
    expect(await bookSlotByTherapist(alice.id, mine.id, { clientId: bobsClient.id })).toEqual({ ok: false, error: "client_not_found" });
    // The failed attempt did not keep the slot.
    expect((await prisma.session.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe("open");
  });

  it("books a slot once, however many try at the same moment", async () => {
    const s = await slot(alice, "10:00", "11:00");
    const results = await Promise.all([
      bookSlotByTherapist(alice.id, s.id, { fullName: "First" }),
      bookSlotByTherapist(alice.id, s.id, { fullName: "Second" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.booking.count({ where: { sessionId: s.id } })).toBe(1);
  });

  it("does not book a blocked or already booked slot", async () => {
    const blocked = await slot(alice, "10:00", "11:00", { status: "blocked" });
    expect(await bookSlotByTherapist(alice.id, blocked.id, { fullName: "X Y" })).toEqual({ ok: false, error: "SLOT_ALREADY_BOOKED" });
  });

  it("moves an empty slot, but not onto another, not into the past, and never somebody else's", async () => {
    const s = await slot(alice, "10:00", "11:00");
    await slot(alice, "13:00", "14:00");
    const moved = await moveSlot(alice.id, s.id, at("11:30"), at("12:30"));
    expect(moved.ok && moved.session.startsAt.toISOString()).toBe(at("11:30").toISOString());
    expect(await moveSlot(alice.id, s.id, at("13:30"), at("14:30"))).toEqual({ ok: false, error: "overlaps_existing" });
    expect(await moveSlot(alice.id, s.id, new Date("2020-01-01T10:00:00Z"), new Date("2020-01-01T11:00:00Z"))).toEqual({ ok: false, error: "in_past" });
    expect(await moveSlot(bob.id, s.id, at("15:00"), at("16:00"))).toEqual({ ok: false, error: "not_found" });
  });

  it("does not move a booked slot or one that follows a room at Cleana", async () => {
    const booked = await slot(alice, "10:00", "11:00", { status: "booked" });
    expect(await moveSlot(alice.id, booked.id, at("15:00"), at("16:00"))).toEqual({ ok: false, error: "not_movable" });
    const fromCleana = await slot(alice, "12:00", "13:00", { cleanaBookingId: "00000000-0000-4000-8000-0000000000aa", cleanaRoom: "Room 1" });
    expect(await moveSlot(alice.id, fromCleana.id, at("15:00"), at("16:00"))).toEqual({ ok: false, error: "from_cleana" });
  });
});
