import { Prisma } from "@/generated/prisma/client";

/**
 * Prisma has no dedicated error code for a Postgres exclusion-constraint violation
 * (unlike P2002 for unique constraints) — it surfaces as the generic P2039, with the
 * real Postgres code (23P01) buried in meta.driverAdapterError.cause.originalCode.
 * Verified directly against this schema's sessions_no_overlap constraint.
 */
export function isExclusionViolation(error: unknown, constraintName?: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2039") {
    return false;
  }
  const meta = error.meta as { driverAdapterError?: { cause?: Record<string, unknown> } } | null;
  const cause = meta?.driverAdapterError?.cause;
  if (cause?.originalCode !== "23P01") return false;
  return !constraintName || String(cause.originalMessage ?? "").includes(constraintName);
}

/**
 * P2002 (unique constraint violation) does carry a dedicated code, but — verified the same
 * way as isExclusionViolation above — this Prisma/driver-adapter combination does NOT
 * populate the classic `meta.target` array. The actual constraint name lives at
 * meta.driverAdapterError.cause.constraint.index (e.g. "therapists_slug_key"); reading
 * `meta.target` here always silently returns undefined instead of ever matching.
 */
export function isUniqueViolation(error: unknown, constraintName?: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const meta = error.meta as {
    driverAdapterError?: { cause?: { constraint?: { index?: string } } };
  } | null;
  const index = meta?.driverAdapterError?.cause?.constraint?.index;
  if (typeof index !== "string") return false;
  return !constraintName || index.includes(constraintName);
}
