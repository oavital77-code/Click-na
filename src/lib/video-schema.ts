import { z } from "zod";
import { normalizeMeetingUrl } from "@/lib/meeting-url";

/**
 * How a therapist holds online sessions — the part a browser may import.
 * One method for the whole practice, chosen in Add-ons.
 */
export const VIDEO_METHODS = ["google_meet", "zoom_link", "zoom_auto", "other"] as const;
export type VideoMethod = (typeof VIDEO_METHODS)[number];

/** The methods that are a standing room link the therapist pastes. */
export const LINK_METHODS: readonly VideoMethod[] = ["google_meet", "zoom_link", "other"];

/** What onboarding asks: the method in plain words; Zoom starts as a standing link. */
export const ONBOARDING_VIDEO_CHOICES = ["google_meet", "zoom_link", "other"] as const;

const roomLink = z.preprocess(
  (v) => (typeof v === "string" ? normalizeMeetingUrl(v) : v),
  z
    .string()
    .trim()
    .url("validation.urlInvalid")
    .max(500)
    .refine((value) => /^https?:\/\//i.test(value), "validation.urlScheme")
);

export const videoSchema = z
  .object({
    method: z.enum(VIDEO_METHODS),
    link: roomLink.optional().or(z.literal("")),
  })
  .refine((d) => !LINK_METHODS.includes(d.method) || !!d.link, {
    message: "validation.meetingUrlRequired",
    path: ["link"],
  })
  .refine((d) => d.method !== "google_meet" || !d.link || /^https:\/\/meet\.google\.com\//i.test(d.link), {
    message: "validation.notMeetLink",
    path: ["link"],
  })
  .refine((d) => d.method !== "zoom_link" || !d.link || /^https:\/\/([a-z0-9-]+\.)*zoom\.us\//i.test(d.link), {
    message: "validation.notZoomLink",
    path: ["link"],
  });

export type VideoInput = z.infer<typeof videoSchema>;

/** Where a therapist stands: what they chose, and whether clients will actually get a way in. */
export type VideoStatus = {
  method: VideoMethod | null;
  link: string | null;
  zoomConnected: boolean;
  /** Clients booking online get a link (or a Zoom meeting is opened for them). */
  ready: boolean;
  /** There is an online place, and it is not ready: online clients would get no way in. */
  missing: boolean;
};

export function videoReady(method: VideoMethod | null, link: string | null, zoomConnected: boolean): boolean {
  if (method === "zoom_auto") return zoomConnected;
  if (method && LINK_METHODS.includes(method)) return !!link;
  // Before a method was ever chosen, a connected Zoom already opened meetings.
  return method === null && zoomConnected;
}
