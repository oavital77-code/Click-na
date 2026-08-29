import { randomBytes } from "node:crypto";

/** Fallback slug per spec 5.5, e.g. "t-a7f3d9" — replaced by the therapist's chosen slug during onboarding. */
export function generateFallbackSlug() {
  return `t-${randomBytes(3).toString("hex")}`;
}

// Spec 5.5: lowercase latin letters, digits, hyphens only, 3-40 chars.
export const SLUG_REGEX = /^[a-z0-9-]{3,40}$/;

// Spec 5.5.
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "dashboard",
  "login",
  "signup",
  "settings",
  "billing",
  "support",
  "help",
  "book",
  "new",
]);
