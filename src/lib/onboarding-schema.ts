import { z } from "zod";
import { ONBOARDING_VIDEO_CHOICES } from "@/lib/video-schema";

import { RESERVED_SLUGS, SLUG_REGEX } from "@/lib/slug";

export const PROFESSION_TYPES = [
  "coach",
  "massage",
  "trainer",
  "therapist",
  "tutor",
  "other",
] as const;

export const LOCATION_TYPES = ["clinic", "online", "client_home", "hybrid"] as const;

// Spec 8.3 / 7.1 step 3.
export const DURATION_OPTIONS = [30, 45, 50, 60, 90] as const;
/** The rest between two sessions. 10 by default: a 50-minute session then starts on the hour. */
export const BREAK_OPTIONS = [0, 5, 10, 15, 20, 30] as const;
export const DEFAULT_BREAK_MINUTES = 10;

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "validation.timeInvalid");

export const onboardingSchema = z
  .object({
    fullName: z.string().trim().min(2, "validation.nameTooShort").max(255),
    phone: z.string().trim().min(7, "validation.phoneInvalid").max(50),
    professionType: z.enum(PROFESSION_TYPES),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(SLUG_REGEX, "validation.slugFormat")
      .refine((slug) => !RESERVED_SLUGS.has(slug), "validation.slugReserved"),
    defaultDurationMinutes: z
      .number()
      .int()
      .refine((v) => (DURATION_OPTIONS as readonly number[]).includes(v), "validation.durationInvalid"),
    // Optional so a client built before the field existed still saves; absent keeps the setting as it is.
    breakMinutes: z
      .number()
      .int()
      .refine((v) => (BREAK_OPTIONS as readonly number[]).includes(v), "validation.durationInvalid")
      .optional(),
    locationType: z.enum(LOCATION_TYPES),
    locationAddress: z.string().trim().max(500).optional(),
    // Online work: which way they will hold sessions. The link itself is connected in Add-ons.
    videoMethod: z.enum(ONBOARDING_VIDEO_CHOICES).optional(),
    availability: z
      .object({
        days: z.array(z.number().int().min(0).max(6)).min(1, "validation.pickAtLeastOneDay"),
        startTime: timeSchema,
        endTime: timeSchema,
      })
      .refine((a) => a.startTime < a.endTime, {
        message: "validation.endAfterStart",
        path: ["endTime"],
      })
      // Skipped on the last step: the therapist can open hours from the
      // dashboard later. Absent means "leave the schedule alone", not "clear it".
      .optional(),
  })
  .refine(
    (data) => !(data.locationType === "online" || data.locationType === "hybrid") || !!data.videoMethod,
    { message: "validation.videoMethodRequired", path: ["videoMethod"] }
  )
  .refine(
    (data) => !["clinic", "client_home"].includes(data.locationType) || !!data.locationAddress,
    { message: "validation.addressRequired", path: ["locationAddress"] }
  )
  .refine(
    (data) => data.locationType !== "hybrid" || !!data.locationAddress,
    { message: "validation.addressRequired", path: ["locationAddress"] }
  );

export type OnboardingInput = z.infer<typeof onboardingSchema>;
