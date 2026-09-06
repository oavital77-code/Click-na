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
import { PROFESSION_TYPES, LOCATION_TYPES, DURATION_OPTIONS } from "@/lib/onboarding-schema";

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "שם קצר מדי").max(255),
  phone: z.string().trim().min(7, "טלפון לא תקין").max(50),
  professionType: z.enum(PROFESSION_TYPES),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_REGEX, "3-40 תווים: אותיות לטיניות קטנות, ספרות ומקפים בלבד")
    .refine((slug) => !RESERVED_SLUGS.has(slug), "כתובת זו שמורה"),
});

export type ProfileInput = z.infer<typeof profileSchema>;

const timeUnitSchema = z.number().int().min(0);

export const settingsSchema = z
  .object({
    defaultDurationMinutes: z
      .number()
      .int()
      .refine((v) => (DURATION_OPTIONS as readonly number[]).includes(v), "משך לא תקין"),
    bufferBeforeMinutes: timeUnitSchema.max(120),
    bufferAfterMinutes: timeUnitSchema.max(120),
    minNoticeHours: timeUnitSchema.max(24 * 30),
    maxAdvanceDays: z.number().int().min(1).max(365),
    locationType: z.enum(LOCATION_TYPES),
    locationAddress: z.string().trim().max(500).optional(),
    locationNotes: z.string().trim().max(500).optional(),
    onlineMeetingUrl: httpUrl.optional().or(z.literal("")),
    cancellationPolicyHours: timeUnitSchema.max(24 * 30),
    cancellationPolicyText: z.string().trim().max(1000).optional(),
    requirePhone: z.boolean(),
    autoConfirm: z.boolean(),
    sendEmailConfirmation: z.boolean(),
    sendEmailReminder: z.boolean(),
    sendSmsReminder: z.boolean(),
    reminderHoursBefore: timeUnitSchema.max(24 * 14),
    brandColor: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, "צבע לא תקין")
      .optional()
      .or(z.literal("")),
    brandLogoUrl: httpUrl.optional().or(z.literal("")),
    bookingPageHeadline: z.string().trim().max(255).optional(),
    bookingPageDescription: z.string().trim().max(1000).optional(),
  })
  .refine((data) => data.locationType !== "online" || !!data.onlineMeetingUrl, {
    message: "נדרש קישור למפגש מקוון",
    path: ["onlineMeetingUrl"],
  })
  .refine(
    (data) => !["clinic", "client_home"].includes(data.locationType) || !!data.locationAddress,
    { message: "נדרשת כתובת", path: ["locationAddress"] }
  )
  .refine(
    (data) =>
      data.locationType !== "hybrid" || !!(data.locationAddress || data.onlineMeetingUrl),
    { message: "נדרשת כתובת או קישור למפגש מקוון", path: ["locationAddress"] }
  );

export type SettingsInput = z.infer<typeof settingsSchema>;
