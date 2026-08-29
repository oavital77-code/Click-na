import { randomBytes } from "node:crypto";

/** Fallback slug per spec 5.5, e.g. "t-a7f3d9" — replaced by the therapist's chosen slug during onboarding. */
export function generateFallbackSlug() {
  return `t-${randomBytes(3).toString("hex")}`;
}
