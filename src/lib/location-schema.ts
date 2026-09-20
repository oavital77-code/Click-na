import { z } from "zod";
import { LOCATION_TYPES } from "@/lib/onboarding-schema";
import { DEFAULT_LOCALE, toLocale, type Locale } from "@/i18n/config";

/**
 * The places a therapist works from — the part of it a browser may import.
 * Schema, types, colours and the small pure helpers; anything that touches
 * the database is in locations.ts, which re-exports all of this for servers.
 */

/** Distinguishable at a glance, legible on both themes, and enough of them. */
export const LOCATION_COLORS = [
  "#c2703d",
  "#2f6f8f",
  "#4f7d4a",
  "#8a5aa8",
  "#b5473f",
  "#3f8f86",
  "#a8762a",
  "#5b6b8a",
] as const;

const httpUrl = z
  .string()
  .trim()
  .url("validation.urlInvalid")
  .max(500)
  .refine((value) => /^https?:\/\//i.test(value), "validation.urlScheme");

export const locationSchema = z
  .object({
    name: z.string().trim().min(1, "validation.required").max(80),
    type: z.enum(LOCATION_TYPES),
    address: z.string().trim().max(500).optional().or(z.literal("")),
    onlineMeetingUrl: httpUrl.optional().or(z.literal("")),
    notes: z.string().trim().max(500).optional().or(z.literal("")),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, "validation.colorInvalid")
      .optional()
      .or(z.literal("")),
  })
  .refine((d) => d.type !== "online" || !!d.onlineMeetingUrl, {
    message: "validation.meetingUrlRequired",
    path: ["onlineMeetingUrl"],
  })
  .refine((d) => !["clinic", "client_home"].includes(d.type) || !!d.address, {
    message: "validation.addressRequired",
    path: ["address"],
  })
  .refine((d) => d.type !== "hybrid" || !!(d.address || d.onlineMeetingUrl), {
    message: "validation.addressOrMeetingUrlRequired",
    path: ["address"],
  });

export type LocationInput = z.infer<typeof locationSchema>;

export type Location = {
  id: string;
  name: string;
  slug: string;
  type: (typeof LOCATION_TYPES)[number];
  address: string | null;
  onlineMeetingUrl: string | null;
  notes: string | null;
  color: string;
  sortOrder: number;
  archived: boolean;
};

type Row = {
  id: string;
  name: string;
  slug: string;
  type: (typeof LOCATION_TYPES)[number];
  address: string | null;
  onlineMeetingUrl: string | null;
  notes: string | null;
  color: string;
  sortOrder: number;
  archivedAt: Date | null;
};

export function toLocation(row: Row): Location {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    address: row.address,
    onlineMeetingUrl: row.onlineMeetingUrl,
    notes: row.notes,
    color: row.color,
    sortOrder: row.sortOrder,
    archived: row.archivedAt !== null,
  };
}

/** What a message or a calendar entry says for "where": the address, else the room link. */
export function locationLabel(
  location: { address: string | null; onlineMeetingUrl: string | null } | null | undefined
) {
  return location?.address ?? location?.onlineMeetingUrl ?? null;
}

/** A location where a video meeting makes sense: online, or online some of the time. */
export function isOnlineLocation(location: { type: string } | null | undefined) {
  return location?.type === "online" || location?.type === "hybrid";
}

export const DEFAULT_NAMES: Record<Locale, Record<(typeof LOCATION_TYPES)[number], string>> = {
  he: { clinic: "הקליניקה", online: "אונליין", client_home: "אצל המטופל", hybrid: "הקליניקה" },
  en: { clinic: "My clinic", online: "Online", client_home: "At the client's", hybrid: "My clinic" },
};

export function defaultLocationName(locale: string | null | undefined, type: (typeof LOCATION_TYPES)[number]) {
  return DEFAULT_NAMES[toLocale(locale ?? DEFAULT_LOCALE)][type];
}

/**
 * The link handle: Latin letters and digits from the name when there are any,
 * otherwise a numbered fallback — a Hebrew name makes an ugly percent-encoded
 * URL in WhatsApp, and this link exists to be pasted there.
 */
export function slugForName(name: string, taken: Set<string>) {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "place";
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}-${n}`;
  return candidate;
}

