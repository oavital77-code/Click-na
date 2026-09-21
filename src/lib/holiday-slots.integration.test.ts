import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ensureDefaultLocation } from "@/lib/locations";
import { createRules } from "@/lib/availability-rules";
import { blockedDates, yearsBetween } from "@/lib/holidays";
import { applyHolidayPolicy, pruneClosedDaysForEveryone } from "@/lib/holiday-slots";
import { addDaysUtc, zonedDateTimeToUtc } from "@/lib/availability";

const TZ = "Asia/Jerusalem";
const EVERYTHING = { blockHolidays: true, blockHolidayEves: true, blockCholHamoed: true };

describe("holiday closures (against a live database)", () => {
  let therapistId: string;
  let locationId: string;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const horizon = addDaysUtc(today, 365);
  const closed = [...blockedDates(EVERYTHING, yearsBetween(today, horizon))].filter((d) => d > addDaysUtc(today, 2) && d < horizon);

  beforeAll(async () => {
    const therapist = await prisma.therapist.create({
      data: {
        email: "holidays-integration@example.com",
        fullName: "Holidays",
        slug: "holidays-integration-test",
        timezone: TZ,
        subscription: { create: {} },
        settings: { create: { minNoticeHours: 1, maxAdvanceDays: 365, ...EVERYTHING } },
      },
    });
    therapistId = therapist.id;
    locationId = (await ensureDefaultLocation(therapistId)).id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { therapistId } });
    await prisma.availabilityRule.deleteMany({ where: { therapistId } });
    await prisma.location.deleteMany({ where: { therapistId } });
    await prisma.therapistSettings.deleteMany({ where: { therapistId } });
    await prisma.subscription.deleteMany({ where: { therapistId } });
    await prisma.therapist.deleteMany({ where: { id: therapistId } });
  });

  async function sessionsOn(date: string) {
    return prisma.session.count({
      where: {
        therapistId,
        startsAt: { gte: zonedDateTimeToUtc(date, "00:00", TZ), lt: zonedDateTimeToUtc(addDaysUtc(date, 1), "00:00", TZ) },
      },
    });
  }

  it("never opens a slot on a closed day, and does on the others", async () => {
    await createRules(therapistId, { days: [0, 1, 2, 3, 4, 5, 6], startTime: "09:00", endTime: "12:00", slotDurationMinutes: 50 });
    expect(await prisma.session.count({ where: { therapistId } })).toBeGreaterThan(0);
    expect(closed.length).toBeGreaterThan(0);
    for (const date of closed) expect(await sessionsOn(date)).toBe(0);
  });

  it("the daily sweep removes an empty slot that got onto a closed day, and leaves a booked one", async () => {
    const date = closed[0];
    const open = await prisma.session.create({
      data: { therapistId, locationId, startsAt: zonedDateTimeToUtc(date, "15:00", TZ), endsAt: zonedDateTimeToUtc(date, "15:50", TZ) },
    });
    const booked = await prisma.session.create({
      data: { therapistId, locationId, status: "booked", startsAt: zonedDateTimeToUtc(date, "16:00", TZ), endsAt: zonedDateTimeToUtc(date, "16:50", TZ) },
    });

    const removed = await pruneClosedDaysForEveryone();
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await prisma.session.findUnique({ where: { id: open.id } })).toBeNull();
    expect(await prisma.session.findUnique({ where: { id: booked.id } })).not.toBeNull();
  });

  it("switching the policy off reopens the days", async () => {
    await prisma.therapistSettings.update({
      where: { therapistId },
      data: { blockHolidays: false, blockHolidayEves: false, blockCholHamoed: false },
    });
    const result = await applyHolidayPolicy(therapistId);
    expect(result.created).toBeGreaterThan(0);
    expect(await sessionsOn(closed[0])).toBeGreaterThan(0);
  });
});
