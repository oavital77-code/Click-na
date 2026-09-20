import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { LOCATION_TYPES } from "@/lib/onboarding-schema";
import {
  DEFAULT_NAMES,
  LOCATION_COLORS,
  defaultLocationName,
  slugForName,
  toLocation,
  type Location,
  type LocationInput,
} from "@/lib/location-schema";

export * from "@/lib/location-schema";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * The places a therapist works from. One calendar, many rooms: a slot always
 * belongs to exactly one of these, and the address a client is sent comes
 * from here. Most therapists have one and never see this layer; the ones with
 * a clinic in two cities get a colour per place and a link per place.
 */

export async function listLocations(
  therapistId: string,
  options: { includeArchived?: boolean } = {},
  db: Db = prisma
): Promise<Location[]> {
  const rows = await db.location.findMany({
    where: { therapistId, ...(options.includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toLocation);
}

/**
 * The place a slot goes when nobody said where: the first active one. Created
 * on the spot for a therapist who has none yet (signed up before this model
 * existed and never onboarded) so that "every slot has a location" holds
 * without a special case at each call site.
 */
export async function ensureDefaultLocation(therapistId: string, db: Db = prisma): Promise<Location> {
  const existing = await db.location.findFirst({
    where: { therapistId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (existing) return toLocation(existing);

  const therapist = await db.therapist.findUniqueOrThrow({ where: { id: therapistId }, select: { locale: true } });
  const taken = new Set((await db.location.findMany({ where: { therapistId }, select: { slug: true } })).map((l) => l.slug));
  const row = await db.location.create({
    data: {
      therapistId,
      name: defaultLocationName(therapist.locale, "clinic"),
      slug: taken.has("main") ? slugForName("main", taken) : "main",
      type: "clinic",
      color: LOCATION_COLORS[0],
      sortOrder: 0,
    },
  });
  return toLocation(row);
}

/**
 * Resolves the location a new slot or rule should carry: the one asked for,
 * if it is this therapist's and not archived; otherwise the default. Someone
 * else's id is simply not theirs, and quietly gets the default too.
 */
export async function resolveLocationId(
  therapistId: string,
  requested: string | null | undefined,
  db: Db = prisma
): Promise<string> {
  if (requested) {
    const owned = await db.location.findFirst({
      where: { id: requested, therapistId, archivedAt: null },
      select: { id: true },
    });
    if (owned) return owned.id;
  }
  return (await ensureDefaultLocation(therapistId, db)).id;
}

function dataFrom(input: LocationInput) {
  return {
    name: input.name,
    type: input.type,
    address: input.address || null,
    onlineMeetingUrl: input.onlineMeetingUrl || null,
    notes: input.notes || null,
  };
}

export async function createLocation(therapistId: string, input: LocationInput): Promise<Location> {
  const siblings = await prisma.location.findMany({
    where: { therapistId },
    select: { slug: true, sortOrder: true },
  });
  const taken = new Set(siblings.map((s) => s.slug));
  const nextOrder = siblings.reduce((max, s) => Math.max(max, s.sortOrder), -1) + 1;
  const row = await prisma.location.create({
    data: {
      therapistId,
      ...dataFrom(input),
      slug: slugForName(input.name, taken),
      color: input.color || LOCATION_COLORS[siblings.length % LOCATION_COLORS.length],
      sortOrder: nextOrder,
    },
  });
  return toLocation(row);
}

export async function updateLocation(
  therapistId: string,
  id: string,
  input: LocationInput
): Promise<Location | null> {
  const owned = await prisma.location.findFirst({ where: { id, therapistId } });
  if (!owned) return null;
  const row = await prisma.location.update({
    where: { id },
    data: { ...dataFrom(input), ...(input.color ? { color: input.color } : {}) },
  });
  return toLocation(row);
}

export type ArchiveLocationResult =
  | { ok: true; removedOpenSlots: number; disabledRules: number }
  | { ok: false; error: "NOT_FOUND" | "LAST_LOCATION" };

/**
 * Retires a place. Its recurring rules stop, its empty future slots go, and
 * everything already booked stays exactly where it is — a client with an
 * appointment there next week still has one, with the address. The last
 * active location cannot go: every slot needs somewhere to be.
 */
export async function archiveLocation(therapistId: string, id: string): Promise<ArchiveLocationResult> {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.location.findFirst({ where: { id, therapistId, archivedAt: null } });
    if (!owned) return { ok: false, error: "NOT_FOUND" };
    const active = await tx.location.count({ where: { therapistId, archivedAt: null } });
    if (active <= 1) return { ok: false, error: "LAST_LOCATION" };

    const disabledRules = (
      await tx.availabilityRule.updateMany({ where: { locationId: id, isActive: true }, data: { isActive: false } })
    ).count;
    const removedOpenSlots = (
      await tx.session.deleteMany({
        where: { locationId: id, status: { in: ["open", "blocked"] }, startsAt: { gt: new Date() } },
      })
    ).count;
    await tx.location.update({ where: { id }, data: { archivedAt: new Date() } });
    return { ok: true, removedOpenSlots, disabledRules };
  });
}

/**
 * Onboarding step 3 in the new model: the answers become the therapist's first
 * place, or update it if a previous run already made one. Returns its id so
 * the weekly rules can point at it.
 */
export async function upsertPrimaryLocation(
  tx: Db,
  therapistId: string,
  input: { locale: string | null; type: (typeof LOCATION_TYPES)[number]; address?: string; onlineMeetingUrl?: string }
): Promise<string> {
  const data = {
    type: input.type,
    address: input.address || null,
    onlineMeetingUrl: input.onlineMeetingUrl || null,
  };
  const existing = await tx.location.findFirst({
    where: { therapistId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (existing) {
    // A name the therapist typed themselves is theirs; only the generated one follows the type.
    const generated = Object.values(DEFAULT_NAMES).some((names) => Object.values(names).includes(existing.name));
    await tx.location.update({
      where: { id: existing.id },
      data: { ...data, ...(generated ? { name: defaultLocationName(input.locale, input.type) } : {}) },
    });
    return existing.id;
  }
  const row = await tx.location.create({
    data: {
      therapistId,
      ...data,
      name: defaultLocationName(input.locale, input.type),
      slug: "main",
      color: LOCATION_COLORS[0],
      sortOrder: 0,
    },
  });
  return row.id;
}
