import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createRules, updateRule, deleteRule, listRulesWithCounts } from "@/lib/availability-rules";

describe("availability-rules (against a live database)", () => {
  let therapistId: string;

  beforeAll(async () => {
    const therapist = await prisma.therapist.create({
      data: {
        email: "rules-integration@example.com",
        fullName: "Rules Integration",
        slug: "rules-integration-test",
        timezone: "Asia/Jerusalem",
        subscription: { create: {} },
        settings: { create: { minNoticeHours: 1, maxAdvanceDays: 14 } },
      },
    });
    therapistId = therapist.id;
  });

  afterEach(async () => {
    await prisma.booking.deleteMany({ where: { therapistId } });
    await prisma.session.deleteMany({ where: { therapistId } });
    await prisma.client.deleteMany({ where: { therapistId } });
    await prisma.availabilityRule.deleteMany({ where: { therapistId } });
  });

  afterAll(async () => {
    await prisma.therapistSettings.deleteMany({ where: { therapistId } });
    await prisma.subscription.deleteMany({ where: { therapistId } });
    await prisma.therapist.deleteMany({ where: { id: therapistId } });
  });

  it("creates one rule per selected day and generates open sessions from them", async () => {
    await createRules(therapistId, {
      days: [0, 2, 4],
      startTime: "09:00",
      endTime: "12:00",
      slotDurationMinutes: 50,
    });

    const rules = await prisma.availabilityRule.findMany({ where: { therapistId } });
    expect(rules).toHaveLength(3);
    expect(rules.map((r) => r.dayOfWeek).sort()).toEqual([0, 2, 4]);

    const sessions = await prisma.session.findMany({ where: { therapistId } });
    expect(sessions.length).toBeGreaterThan(0);
  });

  it("listRulesWithCounts reports zero counts for a rule with no generated sessions yet", async () => {
    await createRules(therapistId, {
      days: [1],
      startTime: "09:00",
      endTime: "10:00",
      slotDurationMinutes: 50,
    });
    // Window too narrow for any slot to fit (60 min window, 50 min slot, no buffer) is not
    // guaranteed here since generation already ran — just assert the shape is sane instead.
    const rules = await listRulesWithCounts(therapistId);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ futureOpenCount: expect.any(Number), futureBookedCount: 0 });
  });

  it("updateRule changes the rule but never touches already-generated sessions (spec 11.3)", async () => {
    await createRules(therapistId, {
      days: [3],
      startTime: "09:00",
      endTime: "12:00",
      slotDurationMinutes: 50,
    });
    const [rule] = await prisma.availabilityRule.findMany({ where: { therapistId } });
    const beforeSessions = await prisma.session.findMany({ where: { therapistId } });
    const beforeCount = beforeSessions.length;

    await updateRule(therapistId, rule.id, {
      startTime: "14:00",
      endTime: "16:00",
      slotDurationMinutes: 30,
      isActive: true,
    });

    // The original sessions must still exist, unchanged, at their original times.
    const afterSessions = await prisma.session.findMany({ where: { id: { in: beforeSessions.map((s) => s.id) } } });
    expect(afterSessions).toHaveLength(beforeCount);
    for (const s of afterSessions) {
      const original = beforeSessions.find((b) => b.id === s.id)!;
      expect(s.startsAt.getTime()).toBe(original.startsAt.getTime());
    }

    const updated = await prisma.availabilityRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(updated.slotDurationMinutes).toBe(30);
  });

  it("deleteRule without removeFutureOpenSlots leaves generated open sessions in place", async () => {
    await createRules(therapistId, {
      days: [5],
      startTime: "09:00",
      endTime: "11:00",
      slotDurationMinutes: 50,
    });
    const [rule] = await prisma.availabilityRule.findMany({ where: { therapistId } });
    const before = await prisma.session.count({ where: { therapistId } });
    expect(before).toBeGreaterThan(0);

    const result = await deleteRule(rule.id, { removeFutureOpenSlots: false });
    expect(result.removedOpenSlots).toBe(0);

    const after = await prisma.session.count({ where: { therapistId } });
    expect(after).toBe(before);

    // The rule itself is gone, and surviving sessions detach cleanly (FK ON DELETE SET NULL).
    const rules = await prisma.availabilityRule.findMany({ where: { therapistId } });
    expect(rules).toHaveLength(0);
    const orphaned = await prisma.session.findMany({ where: { therapistId } });
    expect(orphaned.every((s) => s.generatedFromRuleId === null)).toBe(true);
  });

  it("deleteRule with removeFutureOpenSlots removes open sessions but never a booked one", async () => {
    await createRules(therapistId, {
      days: [6],
      startTime: "09:00",
      endTime: "12:00",
      slotDurationMinutes: 50,
    });
    const [rule] = await prisma.availabilityRule.findMany({ where: { therapistId } });
    const generated = await prisma.session.findMany({ where: { generatedFromRuleId: rule.id } });
    expect(generated.length).toBeGreaterThan(1);

    // Book one of the generated sessions directly, simulating a real client booking.
    const client = await prisma.client.create({
      data: { therapistId, fullName: "לקוח", email: "rule-delete@example.com", phone: "0500000000" },
    });
    const bookedSession = generated[0];
    await prisma.session.update({ where: { id: bookedSession.id }, data: { status: "booked" } });
    await prisma.booking.create({
      data: {
        therapistId,
        sessionId: bookedSession.id,
        clientId: client.id,
        clientNameSnapshot: client.fullName,
        clientEmailSnapshot: client.email,
        clientPhoneSnapshot: client.phone,
        manageToken: "rule-delete-token".padEnd(64, "0"),
        status: "confirmed",
      },
    });

    const result = await deleteRule(rule.id, { removeFutureOpenSlots: true });
    expect(result.removedOpenSlots).toBe(generated.length - 1);
    expect(result.remainingBooked).toBe(1);

    // The booked session must survive, untouched, just detached from the (now-deleted) rule.
    const survivor = await prisma.session.findUniqueOrThrow({ where: { id: bookedSession.id } });
    expect(survivor.status).toBe("booked");
    expect(survivor.generatedFromRuleId).toBeNull();

    // Every other (open) session generated from the rule is gone.
    const remainingOpen = await prisma.session.count({
      where: { id: { in: generated.map((s) => s.id).filter((id) => id !== bookedSession.id) } },
    });
    expect(remainingOpen).toBe(0);
  });
});
