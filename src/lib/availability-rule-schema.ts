import { z } from "zod";
import { halfHourTimeSchema, isAllowedDuration } from "@/lib/onboarding-schema";

const timeSchema = halfHourTimeSchema;
const durationSchema = z.number().int().refine(isAllowedDuration, "validation.durationInvalid");

export const ruleCreateSchema = z
  .object({
    days: z.array(z.number().int().min(0).max(6)).min(1, "validation.pickAtLeastOneDay"),
    startTime: timeSchema,
    endTime: timeSchema,
    slotDurationMinutes: durationSchema,
    // Where these hours take place. Omitted: the therapist's default place.
    locationId: z.string().uuid().optional(),
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
    locationId: z.string().uuid().optional(),
  })
  .refine((d) => d.startTime < d.endTime, {
    message: "validation.endAfterStart",
    path: ["endTime"],
  });

export type RuleUpdateInput = z.infer<typeof ruleUpdateSchema>;
