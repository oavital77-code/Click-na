import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLocation, ensureDefaultLocation } from "@/lib/locations";
import { GET } from "@/app/api/public/therapists/[slug]/availability/route";

/**
 * The public availability endpoint with places: the plain link returns every
 * open slot and says where each is; a place's link returns that place's only;
 * a link to a place that does not exist is a dead link, not another room.
 */
describe("public availability by place (against a live database)", () => {
  const slug = "public-availability-places-test";
  let therapistId: string;
  let mainId: string;
  let ramatGanId: string;

  beforeAll(async () => {
    const therapist = await prisma.therapist.create({
      data: {
        email: "public-availability-places@example.com",
        fullName: "Places",
        slug,
        onboardingCompleted: true,
        subscription: { create: {} },
        settings: { create: { minNoticeHours: 1, maxAdvanceDays: 30 } },
      },
    });
    therapistId = therapist.id;
    mainId = (await ensureDefaultLocation(therapistId)).id;
    ramatGanId = (await createLocation(therapistId, { name: "Ramat Gan", type: "clinic", address: "ביאליק 3" })).id;

    const base = Date.now() + 3 * 24 * 60 * 60 * 1000;
    await prisma.session.createMany({
      data: [
        { therapistId, locationId: mainId, startsAt: new Date(base), endsAt: new Date(base + 50 * 60000) },
        { therapistId, locationId: ramatGanId, startsAt: new Date(base + 2 * 3600000), endsAt: new Date(base + 2 * 3600000 + 50 * 60000) },
      ],
    });
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { therapistId } });
    await prisma.location.deleteMany({ where: { therapistId } });
    await prisma.therapistSettings.deleteMany({ where: { therapistId } });
    await prisma.subscription.deleteMany({ where: { therapistId } });
    await prisma.therapist.deleteMany({ where: { id: therapistId } });
  });

  function call(query: string) {
    const request = new NextRequest(`http://localhost/api/public/therapists/${slug}/availability?${query}`, {
      headers: { "x-forwarded-for": "203.0.113.7" },
    });
    return GET(request, { params: Promise.resolve({ slug }) });
  }

  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  it("without a place: every slot, each saying where it is", async () => {
    const res = await call(`from=${from}&to=${to}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { days: { slots: { locationId: string }[] }[] };
    const ids = body.days.flatMap((d) => d.slots.map((s) => s.locationId)).sort();
    expect(ids).toEqual([mainId, ramatGanId].sort());
  });

  it("with a place: only that place's slots", async () => {
    const res = await call(`from=${from}&to=${to}&location=ramat-gan`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { days: { slots: { locationId: string }[] }[] };
    const ids = body.days.flatMap((d) => d.slots.map((s) => s.locationId));
    expect(ids).toEqual([ramatGanId]);
  });

  // The pattern let "2026-99-99" through, date-fns turned it into an Invalid
  // Date, and Prisma threw: a 500 on a public endpoint from one bad query string.
  // The therapist's page already answers 404 before onboarding is done; the
  // availability behind it did not, and served slots for a half-set-up account.
  it("an account that has not finished onboarding has no public availability", async () => {
    const other = await prisma.therapist.create({
      data: {
        email: "public-availability-unfinished@example.com",
        fullName: "Unfinished",
        slug: "public-availability-unfinished",
        onboardingCompleted: false,
        subscription: { create: {} },
        settings: { create: {} },
      },
    });
    try {
      const request = new NextRequest(`http://localhost/api/public/therapists/${other.slug}/availability?from=${from}&to=${to}`, {
        headers: { "x-forwarded-for": "203.0.113.8" },
      });
      const res = await GET(request, { params: Promise.resolve({ slug: other.slug }) });
      expect(res.status).toBe(404);
    } finally {
      await prisma.therapistSettings.deleteMany({ where: { therapistId: other.id } });
      await prisma.subscription.deleteMany({ where: { therapistId: other.id } });
      await prisma.therapist.delete({ where: { id: other.id } });
    }
  });

  it("a date that matches the pattern but is not a date is a 400, not a 500", async () => {
    const res = await call(`from=2026-99-99&to=${to}`);
    expect(res.status).toBe(400);
  });

  it("with a place that is not theirs: not found, never a fall-through", async () => {
    const res = await call(`from=${from}&to=${to}&location=hod-hasharon`);
    expect(res.status).toBe(404);
  });
});
