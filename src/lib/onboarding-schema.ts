import { z } from "zod";

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
  .url("קישור לא תקין")
  .max(500)
  .refine((value) => /^https?:\/\//i.test(value), "הקישור חייב להתחיל ב-http:// או https://");
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

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "שעה לא תקינה");

export const onboardingSchema = z
  .object({
    fullName: z.string().trim().min(2, "שם קצר מדי").max(255),
    phone: z.string().trim().min(7, "טלפון לא תקין").max(50),
    professionType: z.enum(PROFESSION_TYPES),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(SLUG_REGEX, "3-40 תווים: אותיות לטיניות קטנות, ספרות ומקפים בלבד")
      .refine((slug) => !RESERVED_SLUGS.has(slug), "כתובת זו שמורה"),
    defaultDurationMinutes: z
      .number()
      .int()
      .refine((v) => (DURATION_OPTIONS as readonly number[]).includes(v), "משך לא תקין"),
    locationType: z.enum(LOCATION_TYPES),
    locationAddress: z.string().trim().max(500).optional(),
    onlineMeetingUrl: httpUrl.optional().or(z.literal("")),
    availability: z
      .object({
        days: z.array(z.number().int().min(0).max(6)).min(1, "בחר לפחות יום אחד"),
        startTime: timeSchema,
        endTime: timeSchema,
      })
      .refine((a) => a.startTime < a.endTime, {
        message: "שעת הסיום חייבת להיות אחרי שעת ההתחלה",
        path: ["endTime"],
      }),
  })
  .refine(
    (data) => data.locationType !== "online" || !!data.onlineMeetingUrl,
    { message: "נדרש קישור למפגש מקוון", path: ["onlineMeetingUrl"] }
  )
  .refine(
    (data) => !["clinic", "client_home"].includes(data.locationType) || !!data.locationAddress,
    { message: "נדרשת כתובת", path: ["locationAddress"] }
  )
  .refine(
    (data) =>
      data.locationType !== "hybrid" || !!(data.locationAddress || data.onlineMeetingUrl),
    { message: "נדרשת כתובת או קישור למפגש מקוון", path: ["locationAddress"] }
  );

export type OnboardingInput = z.infer<typeof onboardingSchema>;
