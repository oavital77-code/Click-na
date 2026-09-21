import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ensureDefaultLocation } from "@/lib/locations";
import { generateOpenSessions } from "@/lib/availability";

describe("generateOpenSessions (against a live database)", () => {
  let therapistId: string;

  beforeAll(async () => {
    const therapist = await prisma.therapist.create({
      data: {
        email: "availability-integration@example.com",
        fullName: "Availability Integration",
        slug: "availability-integration-test",
        timezone: "Asia/Jerusalem",
        subscription: { create: {} },
        settings: {
          create: { minNoticeHours: 1, maxAdvanceDays: 14, bufferBeforeMinutes: 0, bufferAfterMinutes: 10, blockHolidays: false },
        },
      },
    });
    therapistId = therapist.id;

    const todayDow = new Date().getUTCDay();
    await prisma.availabilityRule.create({
      data: {
        therapistId,
        locationId: (await ensureDefaultLocation(therapistId)).id,
        dayOfWeek: todayDow,
        startTime: new Date(Date.UTC(1970, 0, 1, 9, 0)),
        endTime: new Date(Date.UTC(1970, 0, 1, 12, 0)),
        slotDurationMinutes: 50,
      },
    });
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { therapistId } });
    await prisma.availabilityRule.deleteMany({ where: { therapistId } });
    await prisma.location.deleteMany({ where: { therapistId } });
    await prisma.therapistSettings.deleteMany({ where: { therapistId } });
    await prisma.subscription.deleteMany({ where: { therapistId } });
    await prisma.therapist.deleteMany({ where: { id: therapistId } });
  });

  it("generates open slots from the recurring rule", async () => {
    const result = await prisma.$transaction((tx) => generateOpenSessions(tx, therapistId));
    expect(result.created).toBeGreaterThan(0);
  });

  it("is idempotent: running it again creates nothing new", async () => {
    const result = await prisma.$transaction((tx) => generateOpenSessions(tx, therapistId));
    expect(result.created).toBe(0);
  });

  it("produced slots that are exactly the configured duration apart with buffer respected", async () => {
    const sessions = await prisma.session.findMany({
      where: { therapistId },
      orderBy: { startsAt: "asc" },
    });
    expect(sessions.length).toBeGreaterThan(0);

    const first = sessions[0];
    expect((first.endsAt.getTime() - first.startsAt.getTime()) / 60000).toBe(50);
    expect(first.generatedFromRuleId).not.toBeNull();

    for (let i = 1; i < sessions.length; i++) {
      const gapMinutes = (sessions[i].startsAt.getTime() - sessions[i - 1].endsAt.getTime()) / 60000;
      // Slots on different days will have a large gap; same-day consecutive slots
      // must respect the 10-minute buffer configured above.
      if (gapMinutes < 24 * 60) {
        expect(gapMinutes).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it("never generates a slot that overlaps an existing one (DB exclusion constraint holds)", async () => {
    const sessions = await prisma.session.findMany({ where: { therapistId }, orderBy: { startsAt: "asc" } });
    for (let i = 1; i < sessions.length; i++) {
      expect(sessions[i].startsAt.getTime()).toBeGreaterThanOrEqual(sessions[i - 1].endsAt.getTime());
    }
  });
});
