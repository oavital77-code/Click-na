import { z } from "zod";
import { DURATION_OPTIONS } from "@/lib/onboarding-schema";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "validation.timeInvalid");
const durationSchema = z
  .number()
  .int()
  .refine((v) => (DURATION_OPTIONS as readonly number[]).includes(v), "validation.durationInvalid");

export const ruleCreateSchema = z
  .object({
    days: z.array(z.number().int().min(0).max(6)).min(1, "validation.pickAtLeastOneDay"),
    startTime: timeSchema,
    endTime: timeSchema,
    slotDurationMinutes: durationSchema,
  })
  .refine((d) => d.startTime < d.endTime, {
    message: "validation.endAfterStart",
    path: ["endTime"],
  });

export type RuleCreateInput = z.infer<typeof ruleCreateSchema>;

// dayOfWeek is intentionally not editable here — changing the day a rule
// applies to is a delete + recreate, not an update.
export const ruleUpdateSchema = z
  .object({
    startTime: timeSchema,
    endTime: timeSchema,
    slotDurationMinutes: durationSchema,
    isActive: z.boolean(),
  })
  .refine((d) => d.startTime < d.endTime, {
    message: "validation.endAfterStart",
    path: ["endTime"],
  });

export type RuleUpdateInput = z.infer<typeof ruleUpdateSchema>;
