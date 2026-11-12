import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { LOCATION_COLORS, slugForName } from "@/lib/locations";
import { isExclusionViolation, isUniqueViolation } from "@/lib/prisma-errors";
import { sendEmail } from "@/lib/email";
import { roomCanceledEmail } from "@/lib/email-templates";
import { appUrl } from "@/lib/public-url";
import { getMessages, toLocale } from "@/i18n";

/**
 * A room the therapist booked at Cleana opens matching slots here (the link is
 * src/lib/cleana-link.ts). Cleana sends the branch, the room and the hours —
 * nothing about clients, other therapists or money — and gets back which
 * slots opened and which did not.
 *
 * The room is cut into slots of the therapist's treatment length plus break,
 * starting at the room's start; time left over at the end (half an hour or
 * more) opens as a shorter slot.
 * The cut is on the room's round hours: the five-minute early entry and early
 * exit at Cleana are for display there only.
 *
 * Opening is safe to repeat: each slot is unique per (therapist, Cleana
 * booking, start), so a double click or a retry opens nothing twice. A slot
 * that would overlap the therapist's own calendar is skipped by the overlap
 * constraint that already guards every slot here.
 */

/**
 * Any UUID Postgres accepts. zod's uuid() checks the RFC version and variant
 * digits, and Cleana's seeded branches have ids like 00000000-…-000000000001,
 * which Postgres stores happily but zod refuses.
 */
export const pgUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const openSlotsSchema = z
  .object({
    bookingId: pgUuid,
    branch: z.object({
      id: pgUuid,
      name: z.string().trim().min(1).max(60),
      address: z.string().trim().max(300),
    }),
    room: z.string().trim().min(1).max(80),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    /**
     * The room booking was moved (other hours, another room): the Cleana
     * booking these hours replace. The same id when the booking kept its id.
     * Its empty slots close; a client's appointment that the new hours still
     * cover, at the same branch, keeps its room.
     */
    replacesBookingId: pgUuid.optional(),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), { message: "end must be after start" })
  // A room booking at Cleana is a few hours, never days. A bound keeps a bad
  // request from writing hundreds of rows.
  .refine((v) => new Date(v.endsAt).getTime() - new Date(v.startsAt).getTime() <= 16 * 60 * 60 * 1000, {
    message: "too long",
  });

export type OpenSlotsInput = z.infer<typeof openSlotsSchema>;

/** `short`: paid room time too brief for a whole session — the therapist's to see, not a client's to book. */
export type Slot = { startsAt: Date; endsAt: Date; short?: boolean };

/**
 * The cut itself. Pure, so every combination in the spec is a unit test.
 *
 * Whole sessions first, from the room's start. Whatever paid room time is left
 * after the last one (and its break) comes back as a `short` slot, as long as
 * it is at least half an hour: the therapist paid for that time at Cleana, so
 * it shows in their calendar here — set aside, not offered to clients, who
 * would be booking half a session. The therapist can open it by hand.
 */
export function splitIntoSlots(startsAt: Date, endsAt: Date, durationMinutes: number, breakMinutes: number): Slot[] {
  if (durationMinutes <= 0) return [];
  const rest = Math.max(0, breakMinutes) * 60_000;
  const length = durationMinutes * 60_000;
  const end = endsAt.getTime();
  const slots: Slot[] = [];
  let t = startsAt.getTime();
  for (; t + length <= end; t += length + rest) {
    slots.push({ startsAt: new Date(t), endsAt: new Date(t + length) });
  }
  // `t` is now where the next session would start, break included.
  if (end - t >= MIN_REMAINDER_MS) slots.push({ startsAt: new Date(t), endsAt: new Date(end), short: true });
  return slots;
}

const MIN_REMAINDER_MS = 30 * 60_000;

export type SkipReason = "overlap" | "past";

export type OpenSlotsResult = {
  /** Null only when a move had nothing here to move. */
  location: { id: string; name: string; created: boolean } | null;
  opened: string[];
  /** Room time too short for a session: marked in the therapist's calendar, not bookable. */
  roomTime: string[];
  alreadyOpen: string[];
  skipped: { startsAt: string; reason: SkipReason }[];
};

function normalizeAddress(address: string | null | undefined) {
  return (address ?? "").replace(/[\s,.'"״׳-]+/g, " ").trim().toLowerCase();
}

/**
 * The place a Cleana branch stands for in this therapist's calendar: the one
 * already linked to it, else a place at the same address (linked from now
 * on), else a new "Baclinica — <branch>" place.
 */
export async function resolveBranchLocation(
  therapistId: string,
  branch: OpenSlotsInput["branch"]
): Promise<{ id: string; name: string; created: boolean }> {
  const linked = await prisma.location.findFirst({
    where: { therapistId, cleanaBranchId: branch.id, archivedAt: null },
    select: { id: true, name: true },
  });
  if (linked) return { ...linked, created: false };

  // Archived since: the link goes with it, so the branch can be placed again.
  await prisma.location.updateMany({
    where: { therapistId, cleanaBranchId: branch.id, archivedAt: { not: null } },
    data: { cleanaBranchId: null },
  });

  const wanted = normalizeAddress(branch.address);
  if (wanted) {
    const places = await prisma.location.findMany({
      where: { therapistId, archivedAt: null, cleanaBranchId: null, type: { in: ["clinic", "hybrid"] } },
      select: { id: true, name: true, address: true },
      orderBy: { sortOrder: "asc" },
    });
    const same = places.find((p) => normalizeAddress(p.address) === wanted);
    if (same) {
      const linkedNow = await linkBranch(therapistId, same.id, branch.id);
      if (linkedNow) return { id: same.id, name: same.name, created: false };
    }
  }

  return createBranchLocation(therapistId, branch);
}

/**
 * A new place for the branch, made under a per-(therapist, branch) lock so two
 * requests arriving together make one place, not two. The second waits, then
 * finds the first one's place.
 */
async function createBranchLocation(
  therapistId: string,
  branch: OpenSlotsInput["branch"]
): Promise<{ id: string; name: string; created: boolean }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cleana-branch:${therapistId}:${branch.id}`}))`;

    const linked = await tx.location.findFirst({
      where: { therapistId, cleanaBranchId: branch.id, archivedAt: null },
      select: { id: true, name: true },
    });
    if (linked) return { ...linked, created: false };

    const siblings = await tx.location.findMany({ where: { therapistId }, select: { slug: true, sortOrder: true } });
    const name = `בקליניקה — ${branch.name}`.slice(0, 80);
    const row = await tx.location.create({
      data: {
        therapistId,
        name,
        type: "clinic",
        address: branch.address || null,
        slug: slugForName(name, new Set(siblings.map((l) => l.slug))),
        color: LOCATION_COLORS[siblings.length % LOCATION_COLORS.length],
        sortOrder: siblings.reduce((max, l) => Math.max(max, l.sortOrder), -1) + 1,
        cleanaBranchId: branch.id,
      },
      select: { id: true, name: true },
    });
    return { ...row, created: true };
  });
}

async function linkBranch(therapistId: string, locationId: string, branchId: string): Promise<boolean> {
  try {
    await prisma.location.update({ where: { id: locationId, therapistId }, data: { cleanaBranchId: branchId } });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

export async function openCleanaSlots(
  therapistId: string,
  input: OpenSlotsInput,
  now: Date = new Date()
): Promise<OpenSlotsResult> {
  const settings = await prisma.therapistSettings.findUnique({
    where: { therapistId },
    select: { defaultDurationMinutes: true, bufferAfterMinutes: true, therapist: { select: { locale: true } } },
  });
  const roomTimeNote = getMessages(toLocale(settings?.therapist.locale)).cleanaLink.roomTimeNote;
  // A move of a booking that never opened slots here opens none now either.
  if (input.replacesBookingId) {
    const had = await prisma.session.count({
      where: { therapistId, cleanaBookingId: input.replacesBookingId, status: { not: "canceled" } },
    });
    if (had === 0) return { location: null, opened: [], roomTime: [], alreadyOpen: [], skipped: [] };
  }

  const location = await resolveBranchLocation(therapistId, input.branch);
  const result: OpenSlotsResult = { location, opened: [], roomTime: [], alreadyOpen: [], skipped: [] };

  const window = { start: new Date(input.startsAt), end: new Date(input.endsAt) };
  // A client's appointment the room (still, or again) covers has a room.
  const covered = {
    therapistId,
    locationId: location.id,
    status: { in: ["booked", "held"] as ("booked" | "held")[] },
    startsAt: { gte: window.start },
    endsAt: { lte: window.end },
  };

  if (input.replacesBookingId) {
    const old = input.replacesBookingId;
    const newlyWithoutRoom = await prisma.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { therapistId, cleanaBookingId: old, OR: [{ status: { in: ["open", "blocked"] } }, { status: "held", holdExpiresAt: { lt: now } }] },
        data: { status: "canceled", cleanaBookingId: null, holdToken: null, holdExpiresAt: null },
      });
      await tx.session.updateMany({
        where: { ...covered, cleanaBookingId: old },
        data: { cleanaBookingId: input.bookingId, cleanaRoom: input.room, cleanaRoomCanceledAt: null },
      });
      // What the new hours left behind (only reachable when the id changed, or
      // the appointment fell outside them): no room.
      const left = await tx.session.findMany({
        where: {
          therapistId,
          cleanaBookingId: old,
          cleanaRoomCanceledAt: null,
          status: { in: ["booked", "held"] },
          NOT: { locationId: location.id, startsAt: { gte: window.start }, endsAt: { lte: window.end } },
        },
        select: { id: true },
      });
      if (left.length > 0) {
        await tx.session.updateMany({ where: { id: { in: left.map((r) => r.id) } }, data: { cleanaRoomCanceledAt: now } });
      }
      return left.map((r) => r.id);
    });
    if (newlyWithoutRoom.length > 0) await sendRoomCanceledEmail(therapistId, newlyWithoutRoom);
  }

  // Marked "no room" earlier, and a room now covers it again — this booking
  // moved back, or the therapist cancelled and then booked the room afresh
  // (a new booking at Cleana, with a new id): the appointment has a room, and
  // belongs to this booking from here on.
  await prisma.session.updateMany({
    where: { ...covered, cleanaRoomCanceledAt: { not: null } },
    data: { cleanaRoomCanceledAt: null, cleanaRoom: input.room, cleanaBookingId: input.bookingId },
  });

  // What already stands in the calendar inside the room's hours. This
  // booking's own slots are "already open"; anything else is the therapist's
  // and is reported as taken. New slots are cut from the free time around
  // all of it, so half an hour before an appointment still opens.
  const standing = await prisma.session.findMany({
    where: {
      therapistId,
      startsAt: { lt: window.end },
      endsAt: { gt: window.start },
      OR: [{ status: { in: ["open", "booked", "blocked"] } }, { status: "held", holdExpiresAt: { gte: now } }],
    },
    select: { startsAt: true, endsAt: true, cleanaBookingId: true, status: true },
    orderBy: { startsAt: "asc" },
  });
  for (const s of standing) {
    if (s.cleanaBookingId === input.bookingId) {
      // Room time already set aside is neither news nor an open slot.
      if (s.status !== "blocked") result.alreadyOpen.push(s.startsAt.toISOString());
    } else result.skipped.push({ startsAt: s.startsAt.toISOString(), reason: "overlap" });
  }
  const duration = settings?.defaultDurationMinutes ?? 60;
  const rest = settings?.bufferAfterMinutes ?? 0;
  const slots: Slot[] = [];
  let cursor = window.start;
  for (const s of [...standing, { startsAt: window.end, endsAt: window.end }]) {
    if (s.startsAt > cursor) slots.push(...splitIntoSlots(cursor, s.startsAt, duration, rest));
    const after = new Date(s.endsAt.getTime() + rest * 60_000);
    if (after > cursor) cursor = after;
  }

  for (const slot of slots) {
    const iso = slot.startsAt.toISOString();
    if (slot.startsAt <= now) {
      result.skipped.push({ startsAt: iso, reason: "past" });
      continue;
    }
    try {
      await prisma.session.create({
        data: {
          therapistId,
          locationId: location.id,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          cleanaBookingId: input.bookingId,
          cleanaRoom: input.room,
          ...(slot.short ? { status: "blocked" as const, blockedNote: roomTimeNote } : {}),
        },
      });
      (slot.short ? result.roomTime : result.opened).push(iso);
    } catch (error) {
      if (isUniqueViolation(error)) {
        result.alreadyOpen.push(iso);
      } else if (isExclusionViolation(error, "sessions_no_overlap")) {
        result.skipped.push({ startsAt: iso, reason: "overlap" });
      } else {
        throw error;
      }
    }
  }

  return result;
}

/**
 * The slots of a Cleana booking that a client holds or has booked — what the
 * therapist is warned about before cancelling the room there. Times only:
 * Cleana never learns who the clients are.
 */
export async function bookedCleanaSlots(therapistId: string, bookingId: string, now: Date = new Date()) {
  const rows = await prisma.session.findMany({
    where: {
      therapistId,
      cleanaBookingId: bookingId,
      OR: [{ status: "booked" }, { status: "held", holdExpiresAt: { gte: now } }],
    },
    select: { startsAt: true },
    orderBy: { startsAt: "asc" },
  });
  return rows.map((r) => r.startsAt.toISOString());
}

export type CloseSlotsResult = { closed: number; noRoom: string[] };

/**
 * The room at Cleana was cancelled (or moved). Its empty slots close; an
 * appointment a client already made is kept but marked "no room", never
 * reopens, and the therapist gets an email to sort it out with the client.
 * Safe to repeat: a second call finds nothing left to close and no one new
 * to mark, so it sends nothing.
 */
export async function closeCleanaSlots(
  therapistId: string,
  bookingId: string,
  now: Date = new Date()
): Promise<CloseSlotsResult> {
  const { closed, flagged } = await prisma.$transaction(async (tx) => {
    const closedRows = await tx.session.updateMany({
      where: {
        therapistId,
        cleanaBookingId: bookingId,
        // Blocked too: room time set aside, or a slot of this room the therapist blocked.
        OR: [{ status: { in: ["open", "blocked"] } }, { status: "held", holdExpiresAt: { lt: now } }],
      },
      // Unlinked, so the same hours can be opened again if the room is booked again.
      data: { status: "canceled", cleanaBookingId: null, holdToken: null, holdExpiresAt: null },
    });
    const toFlag = await tx.session.findMany({
      where: {
        therapistId,
        cleanaBookingId: bookingId,
        cleanaRoomCanceledAt: null,
        status: { in: ["booked", "held"] },
      },
      select: { id: true },
    });
    if (toFlag.length > 0) {
      await tx.session.updateMany({
        where: { id: { in: toFlag.map((r) => r.id) } },
        data: { cleanaRoomCanceledAt: now },
      });
    }
    return { closed: closedRows.count, flagged: toFlag.map((r) => r.id) };
  });

  const noRoom = await prisma.session.findMany({
    where: { therapistId, cleanaBookingId: bookingId, cleanaRoomCanceledAt: { not: null }, status: { in: ["booked", "held"] } },
    select: { startsAt: true },
    orderBy: { startsAt: "asc" },
  });

  if (flagged.length > 0) await sendRoomCanceledEmail(therapistId, flagged);

  return { closed, noRoom: noRoom.map((r) => r.startsAt.toISOString()) };
}

async function sendRoomCanceledEmail(therapistId: string, sessionIds: string[]) {
  try {
    const therapist = await prisma.therapist.findUnique({ where: { id: therapistId } });
    if (!therapist) return;
    const sessions = await prisma.session.findMany({
      where: { id: { in: sessionIds } },
      select: { startsAt: true, cleanaRoom: true, booking: { select: { id: true, clientNameSnapshot: true } } },
      orderBy: { startsAt: "asc" },
    });
    const locale = toLocale(therapist.locale);
    const { subject, html } = roomCanceledEmail({
      locale,
      timezone: therapist.timezone,
      room: sessions[0]?.cleanaRoom ?? "",
      appointments: sessions.map((s) => ({
        startsAt: s.startsAt,
        clientName: s.booking?.clientNameSnapshot ?? getMessages(locale).cleanaLink.heldByClient,
      })),
      calendarUrl: `${appUrl()}/dashboard`,
    });
    const notification = await prisma.notification.create({
      data: {
        therapistId,
        bookingId: sessions.length === 1 ? (sessions[0].booking?.id ?? null) : null,
        type: "room_canceled",
        channel: "email",
        recipient: therapist.email,
        status: "pending",
      },
    });
    const result = await sendEmail({ to: therapist.email, subject, html });
    await prisma.notification.update({
      where: { id: notification.id },
      data: result.ok
        ? { status: "sent", sentAt: new Date(), attempts: { increment: 1 } }
        : { status: "failed", errorMessage: result.error, attempts: { increment: 1 } },
    });
  } catch (error) {
    // The calendar already shows "no room"; a failed email must not fail the close.
    console.error("[cleana-slots] room-canceled email failed", { therapistId, error });
  }
}
