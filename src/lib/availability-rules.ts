import { prisma } from "@/lib/prisma";
import { generateOpenSessions, toTimeValue } from "@/lib/availability";
import type { RuleCreateInput, RuleUpdateInput } from "@/lib/availability-rule-schema";

export async function listRulesWithCounts(therapistId: string) {
  const rules = await prisma.availabilityRule.findMany({
    where: { therapistId },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });

  const now = new Date();
  return Promise.all(
    rules.map(async (rule) => {
      const [futureOpenCount, futureBookedCount] = await Promise.all([
        prisma.session.count({
          where: { generatedFromRuleId: rule.id, status: "open", startsAt: { gt: now } },
        }),
        prisma.session.count({
          where: { generatedFromRuleId: rule.id, status: "booked", startsAt: { gt: now } },
        }),
      ]);
      return { ...rule, futureOpenCount, futureBookedCount };
    })
  );
}

export async function createRules(therapistId: string, input: RuleCreateInput) {
  await prisma.$transaction(async (tx) => {
    await tx.availabilityRule.createMany({
      data: input.days.map((dayOfWeek) => ({
        therapistId,
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
    await tx.availabilityRule.update({
      where: { id: ruleId },
      data: {
        startTime: toTimeValue(input.startTime),
        endTime: toTimeValue(input.endTime),
        slotDurationMinutes: input.slotDurationMinutes,
        isActive: input.isActive,
      },
    });
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
