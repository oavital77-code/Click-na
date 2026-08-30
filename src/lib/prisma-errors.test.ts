import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { isExclusionViolation, isUniqueViolation } from "@/lib/prisma-errors";

function exclusionError(constraintName: string) {
  return new Prisma.PrismaClientKnownRequestError("exclusion violation", {
    code: "P2039",
    clientVersion: "test",
    meta: {
      driverAdapterError: {
        cause: {
          originalCode: "23P01",
          originalMessage: `conflicting key value violates exclusion constraint "${constraintName}"`,
        },
      },
    },
  });
}

function uniqueViolationError(constraintIndex: string) {
  return new Prisma.PrismaClientKnownRequestError("unique violation", {
    code: "P2002",
    clientVersion: "test",
    meta: {
      driverAdapterError: {
        cause: {
          originalCode: "23505",
          constraint: { index: constraintIndex },
        },
      },
    },
  });
}

describe("isExclusionViolation", () => {
  it("detects a real exclusion-constraint violation", () => {
    expect(isExclusionViolation(exclusionError("sessions_no_overlap"))).toBe(true);
  });

  it("matches against a specific constraint name when given one", () => {
    expect(isExclusionViolation(exclusionError("sessions_no_overlap"), "sessions_no_overlap")).toBe(
      true
    );
  });

  it("rejects when the constraint name doesn't match", () => {
    expect(isExclusionViolation(exclusionError("sessions_no_overlap"), "some_other_constraint")).toBe(
      false
    );
  });

  it("does not misclassify an unrelated Prisma error code", () => {
    const uniqueViolation = new Prisma.PrismaClientKnownRequestError("unique violation", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["slug"] },
    });
    expect(isExclusionViolation(uniqueViolation)).toBe(false);
  });

  it("does not misclassify a plain Error", () => {
    expect(isExclusionViolation(new Error("something else"))).toBe(false);
  });

  it("does not misclassify a non-error value", () => {
    expect(isExclusionViolation(null)).toBe(false);
    expect(isExclusionViolation(undefined)).toBe(false);
    expect(isExclusionViolation("string")).toBe(false);
  });
});

describe("isUniqueViolation", () => {
  it("detects a real unique-constraint violation", () => {
    expect(isUniqueViolation(uniqueViolationError("therapists_slug_key"))).toBe(true);
  });

  it("matches against a specific constraint name when given one", () => {
    expect(isUniqueViolation(uniqueViolationError("therapists_slug_key"), "slug")).toBe(true);
  });

  it("rejects when the constraint name doesn't match", () => {
    expect(isUniqueViolation(uniqueViolationError("therapists_email_key"), "slug")).toBe(false);
  });

  it("does not read the classic (and, for this Prisma/adapter combo, absent) meta.target shape", () => {
    // Regression guard: an earlier version of this check read error.meta.target, which this
    // Prisma/driver-adapter combination never actually populates — it always silently
    // evaluated to false. Confirm a target-shaped error alone doesn't fool a match.
    const error = new Prisma.PrismaClientKnownRequestError("unique violation", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["slug"] },
    });
    expect(isUniqueViolation(error, "slug")).toBe(false);
  });

  it("does not misclassify an unrelated Prisma error code", () => {
    expect(isUniqueViolation(exclusionError("sessions_no_overlap"))).toBe(false);
  });

  it("does not misclassify a plain Error", () => {
    expect(isUniqueViolation(new Error("something else"))).toBe(false);
  });

  it("does not misclassify a non-error value", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});
