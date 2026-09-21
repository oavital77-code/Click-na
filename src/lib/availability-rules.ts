import { prisma } from "@/lib/prisma";
import { generateOpenSessions, toTimeValue } from "@/lib/availability";
import { resolveLocationId } from "@/lib/locations";
import type { RuleCreateInput, RuleUpdateInput } from "@/lib/availability-rule-schema";

export async function listRulesWithCounts(therapistId: string) {
  const rules = await prisma.availabilityRule.findMany({
    where: { therapistId },
    include: { location: { select: { id: true, name: true, color: true } } },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });

  // One grouped count for every rule, instead of two queries per rule.
  const counts = await prisma.session.groupBy({
    by: ["generatedFromRuleId", "status"],
    where: { therapistId, generatedFromRuleId: { not: null }, status: { in: ["open", "booked"] }, startsAt: { gt: new Date() } },
    _count: { _all: true },
  });
  const byRule = new Map<string, { open: number; booked: number }>();
  for (const row of counts) {
    if (!row.generatedFromRuleId) continue;
    const entry = byRule.get(row.generatedFromRuleId) ?? { open: 0, booked: 0 };
    if (row.status === "open") entry.open = row._count._all;
    if (row.status === "booked") entry.booked = row._count._all;
    byRule.set(row.generatedFromRuleId, entry);
  }
  return rules.map((rule) => ({
    ...rule,
    futureOpenCount: byRule.get(rule.id)?.open ?? 0,
    futureBookedCount: byRule.get(rule.id)?.booked ?? 0,
  }));
}

export async function createRules(therapistId: string, input: RuleCreateInput) {
  await prisma.$transaction(async (tx) => {
    const locationId = await resolveLocationId(therapistId, input.locationId, tx);
    await tx.availabilityRule.createMany({
      data: input.days.map((dayOfWeek) => ({
        therapistId,
        locationId,
        dayOfWeek,
        startTime: toTimeValue(input.startTime),
        endTime: toTimeValue(input.endTime),
        slotDurationMinutes: input.slotDurationMinutes,
      })),
    });
    await generateOpenSessions(tx, therapistId);
  });
}

export async function updateRule(therapistId: string, ruleId: string, input: RuleUpdateInput) {
  await prisma.$transaction(async (tx) => {
    const location = input.locationId ? { locationId: await resolveLocationId(therapistId, input.locationId, tx) } : {};
    await tx.availabilityRule.update({
      where: { id: ruleId },
      data: {
        startTime: toTimeValue(input.startTime),
        endTime: toTimeValue(input.endTime),
        slotDurationMinutes: input.slotDurationMinutes,
        isActive: input.isActive,
        ...location,
      },
    });
    // Moving a rule to another place moves the empty slots it already opened —
    // they are that rule's hours, and nothing has been promised on them yet.
    if (input.locationId) {
      await tx.session.updateMany({
        where: { generatedFromRuleId: ruleId, status: "open", startsAt: { gt: new Date() } },
        data: { locationId: location.locationId },
      });
    }
    // Only affects slots generated from here on — already-generated sessions
    // are never retroactively changed (spec 11.3).
    await generateOpenSessions(tx, therapistId);
  });
}

export async function deleteRule(ruleId: string, options: { removeFutureOpenSlots: boolean }) {
  return prisma.$transaction(async (tx) => {
    let removedOpenSlots = 0;
    if (options.removeFutureOpenSlots) {
      const deleted = await tx.session.deleteMany({
        where: { generatedFromRuleId: ruleId, status: "open", startsAt: { gt: new Date() } },
      });
      removedOpenSlots = deleted.count;
    }
    // Booked sessions are never touched here — deleting the rule just detaches
    // them (generatedFromRuleId -> null via the FK's ON DELETE SET NULL).
    const remainingBooked = await tx.session.count({
      where: { generatedFromRuleId: ruleId, status: "booked", startsAt: { gt: new Date() } },
    });
    await tx.availabilityRule.delete({ where: { id: ruleId } });
    return { removedOpenSlots, remainingBooked };
  });
}
