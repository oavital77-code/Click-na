import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { exchangeAuthorizationCode, issueAuthorizationCode } from "@/lib/cleana-link";
import { bookedCleanaSlots, closeCleanaSlots, openCleanaSlots, type OpenSlotsInput } from "@/lib/cleana-slots";
import { cancelBookingByTherapist } from "@/lib/bookings";

const sendEmail = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { POST: openRoute } = await import("@/app/api/integrations/cleana/slots/route");

const KEY = Buffer.alloc(32, 11).toString("base64");
const BRANCH = { id: "11111111-1111-4111-8111-111111111111", name: "הוד השרון", address: "הבנים 12, הוד השרון" };
const DAY = "2030-01-15"; // far enough ahead to never be "past"
const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00+02:00`).toISOString();

let n = 0;
function booking(overrides: Partial<OpenSlotsInput> = {}): OpenSlotsInput {
  n += 1;
  return {
    bookingId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    branch: BRANCH,
    room: "Room 3",
    startsAt: at("14:00"),
    endsAt: at("17:00"),
    ...overrides,
  };
}

async function makeTherapist(tag: string) {
  const t = await prisma.therapist.create({
    data: {
      email: `cleana-slots-${tag}@example.com`,
      fullName: `Cleana Slots ${tag}`,
      slug: `cleana-slots-${tag}-test`,
      subscription: { create: {} },
      settings: { create: { defaultDurationMinutes: 50, bufferAfterMinutes: 10 } },
    },
  });
  return t.id;
}

describe("opening slots from Cleana (against a live database)", () => {
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    alice = await makeTherapist("alice");
    bob = await makeTherapist("bob");
  });

  beforeEach(async () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", KEY);
    for (const id of [alice, bob]) {
      await prisma.notification.deleteMany({ where: { therapistId: id } });
      await prisma.booking.deleteMany({ where: { therapistId: id } });
      await prisma.client.deleteMany({ where: { therapistId: id } });
      await prisma.session.deleteMany({ where: { therapistId: id } });
      await prisma.location.deleteMany({ where: { therapistId: id } });
      await prisma.integration.deleteMany({ where: { therapistId: id } });
    }
    sendEmail.mockClear();
  });

  afterAll(async () => {
    const ids = [alice, bob];
    await prisma.notification.deleteMany({ where: { therapistId: { in: ids } } });
    await prisma.booking.deleteMany({ where: { therapistId: { in: ids } } });
    await prisma.client.deleteMany({ where: { therapistId: { in: ids } } });
    await prisma.session.deleteMany({ where: { therapistId: { in: ids } } });
    await prisma.location.deleteMany({ where: { therapistId: { in: ids } } });
    await prisma.integration.deleteMany({ where: { therapistId: { in: ids } } });
    await prisma.therapistSettings.deleteMany({ where: { therapistId: { in: ids } } });
    await prisma.subscription.deleteMany({ where: { therapistId: { in: ids } } });
    await prisma.therapist.deleteMany({ where: { id: { in: ids } } });
  });

  it("cuts the room by the therapist's length and break, in a new place for the branch", async () => {
    const result = await openCleanaSlots(alice, booking());
    expect(result.opened).toEqual([at("14:00"), at("15:00"), at("16:00")]);
    expect(result.location).toMatchObject({ name: "בקליניקה — הוד השרון", created: true });
    const sessions = await prisma.session.findMany({ where: { therapistId: alice }, orderBy: { startsAt: "asc" } });
    expect(sessions.map((s) => s.endsAt.getTime() - s.startsAt.getTime())).toEqual([50, 50, 50].map((m) => m * 60_000));
    expect(sessions.every((s) => s.cleanaRoom === "Room 3" && s.status === "open")).toBe(true);
    const place = await prisma.location.findUniqueOrThrow({ where: { id: result.location.id } });
    expect(place).toMatchObject({ address: BRANCH.address, cleanaBranchId: BRANCH.id, type: "clinic" });
  });

  it("uses a place the therapist already has at that address, and remembers it", async () => {
    const own = await prisma.location.create({
      data: { therapistId: alice, name: "הקליניקה שלי", slug: "mine", address: "הבנים 12 הוד השרון", color: "#000000" },
    });
    const first = await openCleanaSlots(alice, booking());
    expect(first.location).toEqual({ id: own.id, name: "הקליניקה שלי", created: false });
    const second = await openCleanaSlots(alice, booking({ startsAt: at("18:00"), endsAt: at("19:00") }));
    expect(second.location.id).toBe(own.id);
    expect(await prisma.location.count({ where: { therapistId: alice } })).toBe(1);
  });

  it("opens a booking once, however many times it is asked", async () => {
    const b = booking();
    await openCleanaSlots(alice, b);
    const again = await openCleanaSlots(alice, b);
    expect(again.opened).toEqual([]);
    expect(again.alreadyOpen).toHaveLength(3);
    const both = await Promise.all([openCleanaSlots(alice, b), openCleanaSlots(alice, b)]);
    expect(both.flatMap((r) => r.opened)).toEqual([]);
    expect(await prisma.session.count({ where: { therapistId: alice } })).toBe(3);
  });

  it("opens two concurrent first requests once", async () => {
    const b = booking();
    const both = await Promise.all([openCleanaSlots(alice, b), openCleanaSlots(alice, b)]);
    expect(both.flatMap((r) => r.opened).sort()).toEqual([at("14:00"), at("15:00"), at("16:00")]);
    expect(await prisma.session.count({ where: { therapistId: alice } })).toBe(3);
    expect(await prisma.location.count({ where: { therapistId: alice, archivedAt: null } })).toBe(1);
  });

  it("skips the slots the therapist already has taken", async () => {
    const place = await prisma.location.create({
      data: { therapistId: alice, name: "elsewhere", slug: "elsewhere", color: "#000000" },
    });
    await prisma.session.create({
      data: { therapistId: alice, locationId: place.id, startsAt: new Date(at("16:00")), endsAt: new Date(at("16:50")) },
    });
    const result = await openCleanaSlots(alice, booking());
    expect(result.opened).toEqual([at("14:00"), at("15:00")]);
    expect(result.skipped).toEqual([{ startsAt: at("16:00"), reason: "overlap" }]);
  });

  it("does not open slots that already started", async () => {
    const result = await openCleanaSlots(alice, booking(), new Date(at("15:30")));
    expect(result.opened).toEqual([at("16:00")]);
    expect(result.skipped.map((s) => s.reason)).toEqual(["past", "past"]);
  });

  it("goes through the route only with the therapist's own token", async () => {
    const code = await issueAuthorizationCode(alice);
    const ex = await exchangeAuthorizationCode(code);
    if (!ex.ok) throw new Error("no token");
    const call = (token: string) =>
      openRoute(
        new NextRequest("https://plus.example/api/integrations/cleana/slots", {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify(booking()),
        })
      );
    const ok = await call(ex.accessToken);
    expect(ok.status).toBe(200);
    expect((await ok.json()).opened).toHaveLength(3);
    expect(await prisma.session.count({ where: { therapistId: bob } })).toBe(0);
    expect((await call("clp_nope.nope")).status).toBe(401);
  });

  // A client books one of the opened slots, the way the public page leaves it.
  async function clientBooks(therapistId: string, startsAt: string, name = "Dana") {
    const session = await prisma.session.findFirstOrThrow({
      where: { therapistId, startsAt: new Date(startsAt), status: "open" },
    });
    await prisma.session.update({ where: { id: session.id }, data: { status: "booked" } });
    const client = await prisma.client.create({ data: { therapistId, fullName: name, email: `${name}-${n}@example.com` } });
    return prisma.booking.create({
      data: {
        therapistId,
        sessionId: session.id,
        clientId: client.id,
        clientNameSnapshot: name,
        status: "confirmed",
        manageToken: `manage-${session.id}`,
      },
    });
  }

  describe("closing when the room is cancelled at Cleana", () => {
    it("tells which slots clients have booked — times only", async () => {
      const b = booking();
      await openCleanaSlots(alice, b);
      await clientBooks(alice, at("15:00"));
      expect(await bookedCleanaSlots(alice, b.bookingId)).toEqual([at("15:00")]);
      expect(await bookedCleanaSlots(bob, b.bookingId)).toEqual([]);
    });

    it("closes the empty slots and marks a booked one 'no room', with one email", async () => {
      const b = booking();
      await openCleanaSlots(alice, b);
      await clientBooks(alice, at("15:00"));

      const result = await closeCleanaSlots(alice, b.bookingId);
      expect(result).toEqual({ closed: 2, noRoom: [at("15:00")] });

      const live = await prisma.session.findMany({ where: { therapistId: alice, status: { not: "canceled" } } });
      expect(live).toHaveLength(1);
      expect(live[0]).toMatchObject({ status: "booked" });
      expect(live[0].cleanaRoomCanceledAt).not.toBeNull();
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: "cleana-slots-alice@example.com" });
      expect(JSON.stringify(sendEmail.mock.calls[0][0])).toContain("Dana");

      // Asked again: nothing left to close, nobody new to tell.
      expect(await closeCleanaSlots(alice, b.bookingId)).toEqual({ closed: 0, noRoom: [at("15:00")] });
      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it("never reopens an hour whose room is gone when the client cancels", async () => {
      const b = booking();
      await openCleanaSlots(alice, b);
      const appt = await clientBooks(alice, at("15:00"));
      await closeCleanaSlots(alice, b.bookingId);
      expect((await cancelBookingByTherapist(alice, appt.id)).ok).toBe(true);
      expect(await prisma.session.count({ where: { therapistId: alice, status: "open" } })).toBe(0);
    });

    it("keeps a reopened hour linked, so a later cancellation at Cleana still closes it", async () => {
      const b = booking();
      await openCleanaSlots(alice, b);
      const appt = await clientBooks(alice, at("15:00"));
      await cancelBookingByTherapist(alice, appt.id);
      const reopened = await prisma.session.findFirstOrThrow({
        where: { therapistId: alice, startsAt: new Date(at("15:00")), status: "open" },
      });
      expect(reopened).toMatchObject({ cleanaBookingId: b.bookingId, cleanaRoom: "Room 3" });
      expect(await closeCleanaSlots(alice, b.bookingId)).toEqual({ closed: 3, noRoom: [] });
      expect(await prisma.session.count({ where: { therapistId: alice, status: "open" } })).toBe(0);
    });

    it("lets the same hours be opened again after a close", async () => {
      const b = booking();
      await openCleanaSlots(alice, b);
      await closeCleanaSlots(alice, b.bookingId);
      expect((await openCleanaSlots(alice, b)).opened).toHaveLength(3);
    });

    it("does not touch another therapist's slots", async () => {
      const b = booking();
      await openCleanaSlots(alice, b);
      expect(await closeCleanaSlots(bob, b.bookingId)).toEqual({ closed: 0, noRoom: [] });
      expect(await prisma.session.count({ where: { therapistId: alice, status: "open" } })).toBe(3);
    });
  });
});
