import { z } from "zod";
import { normalizeMeetingUrl } from "@/lib/meeting-url";

/**
 * A URL a therapist types in and the app later renders as a link or an image
 * source. `.url()` alone accepts any scheme — `javascript:` and `data:` parse as
 * valid URLs — so the scheme is pinned to http(s): a meeting link or a logo is
 * never anything else, and a stored `javascript:` URL is one careless `<a href>`
 * away from running in a client's browser.
 */
const httpUrl = z
  .string()
  .trim()
  .url("validation.urlInvalid")
  .max(500)
  .refine((value) => /^https?:\/\//i.test(value), "validation.urlScheme");

/** A meeting link as pasted — a bare Meet code or a link without https is completed first. */
const meetingUrl = z.preprocess((v) => (typeof v === "string" ? normalizeMeetingUrl(v) : v), httpUrl);
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
    onlineMeetingUrl: meetingUrl.optional().or(z.literal("")),
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
    (data) => data.locationType !== "online" || !!data.onlineMeetingUrl,
    { message: "validation.meetingUrlRequired", path: ["onlineMeetingUrl"] }
  )
  .refine(
    (data) => !["clinic", "client_home"].includes(data.locationType) || !!data.locationAddress,
    { message: "validation.addressRequired", path: ["locationAddress"] }
  )
  .refine(
    (data) =>
      data.locationType !== "hybrid" || !!(data.locationAddress || data.onlineMeetingUrl),
    { message: "validation.addressOrMeetingUrlRequired", path: ["locationAddress"] }
  );

export type OnboardingInput = z.infer<typeof onboardingSchema>;
