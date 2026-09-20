import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  archiveLocation,
  createLocation,
  ensureDefaultLocation,
  listLocations,
  resolveLocationId,
  updateLocation,
} from "@/lib/locations";
import { createRules } from "@/lib/availability-rules";

describe("locations (against a live database)", () => {
  let therapistId: string;
  let otherId: string;

  beforeAll(async () => {
    const [a, b] = await Promise.all(
      ["a", "b"].map((k) =>
        prisma.therapist.create({
          data: {
            email: `locations-${k}@example.com`,
            fullName: k,
            locale: "he",
            slug: `locations-${k}-test`,
            subscription: { create: {} },
            settings: { create: { minNoticeHours: 1, maxAdvanceDays: 14 } },
          },
        })
      )
    );
    therapistId = a.id;
    otherId = b.id;
  });

  afterAll(async () => {
    for (const id of [therapistId, otherId]) {
      await prisma.session.deleteMany({ where: { therapistId: id } });
      await prisma.availabilityRule.deleteMany({ where: { therapistId: id } });
      await prisma.location.deleteMany({ where: { therapistId: id } });
      await prisma.therapistSettings.deleteMany({ where: { therapistId: id } });
      await prisma.subscription.deleteMany({ where: { therapistId: id } });
      await prisma.therapist.deleteMany({ where: { id } });
    }
  });

  it("makes a default place, in the therapist's language, exactly once", async () => {
    const first = await ensureDefaultLocation(therapistId);
    const second = await ensureDefaultLocation(therapistId);
    expect(second.id).toBe(first.id);
    expect(first.name).toBe("הקליניקה");
    expect(first.slug).toBe("main");
  });

  it("creates further places with their own handle, colour and order", async () => {
    const ramatGan = await createLocation(therapistId, { name: "Ramat Gan", type: "clinic", address: "ביאליק 3" });
    const online = await createLocation(therapistId, { name: "Online", type: "online", onlineMeetingUrl: "https://zoom.us/j/1" });
    expect(ramatGan.slug).toBe("ramat-gan");
    expect(online.slug).toBe("online");
    expect(ramatGan.color).not.toBe(online.color);
    const list = await listLocations(therapistId);
    expect(list.map((l) => l.slug)).toEqual(["main", "ramat-gan", "online"]);
  });

  it("resolves a requested place only when it is this therapist's, else the default", async () => {
    const mine = (await listLocations(therapistId))[1];
    const theirs = await ensureDefaultLocation(otherId);
    expect(await resolveLocationId(therapistId, mine.id)).toBe(mine.id);
    expect(await resolveLocationId(therapistId, theirs.id)).toBe((await listLocations(therapistId))[0].id);
    expect(await resolveLocationId(therapistId, undefined)).toBe((await listLocations(therapistId))[0].id);
  });

  it("updates in place and refuses someone else's id", async () => {
    const mine = (await listLocations(therapistId))[1];
    const updated = await updateLocation(therapistId, mine.id, { name: "Ramat Gan", type: "clinic", address: "ביאליק 5" });
    expect(updated?.address).toBe("ביאליק 5");
    expect(await updateLocation(otherId, mine.id, { name: "x", type: "clinic", address: "y" })).toBeNull();
  });

  it("archiving a place stops its rules, drops its empty future slots, and never the last place", async () => {
    const ramatGan = (await listLocations(therapistId))[1];
    await createRules(therapistId, { days: [0, 1, 2, 3, 4, 5, 6], startTime: "09:00", endTime: "12:00", slotDurationMinutes: 50, locationId: ramatGan.id });
    const before = await prisma.session.count({ where: { locationId: ramatGan.id, status: "open" } });
    expect(before).toBeGreaterThan(0);

    const result = await archiveLocation(therapistId, ramatGan.id);
    expect(result.ok).toBe(true);
    expect(await prisma.session.count({ where: { locationId: ramatGan.id, status: "open" } })).toBe(0);
    expect(await prisma.availabilityRule.count({ where: { locationId: ramatGan.id, isActive: true } })).toBe(0);
    expect((await listLocations(therapistId)).map((l) => l.slug)).toEqual(["main", "online"]);

    const only = await ensureDefaultLocation(otherId);
    expect(await archiveLocation(otherId, only.id)).toEqual({ ok: false, error: "LAST_LOCATION" });
    expect(await archiveLocation(otherId, ramatGan.id)).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("generated slots carry the rule's place", async () => {
    const online = (await listLocations(therapistId)).find((l) => l.slug === "online")!;
    await createRules(therapistId, { days: [0, 1, 2, 3, 4, 5, 6], startTime: "14:00", endTime: "16:00", slotDurationMinutes: 50, locationId: online.id });
    const sample = await prisma.session.findFirst({ where: { therapistId, generatedFromRule: { locationId: online.id } } });
    expect(sample?.locationId).toBe(online.id);
  });
});
