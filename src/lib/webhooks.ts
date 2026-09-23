import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { generateFallbackSlug } from "@/lib/slug";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { trialEndFor } from "@/lib/access";
import { DEFAULT_LOCALE } from "@/i18n/config";

const MAX_SLUG_ATTEMPTS = 5;

export type ClerkUserCreatedData = {
  id: string;
  email_addresses: {
    id: string;
    email_address: string;
    /** Clerk's own verification record for the address; null when it never ran. */
    verification?: { status: string } | null;
  }[];
  primary_email_address_id: string | null;
  first_name: string | null;
  last_name: string | null;
};

/**
 * Returns the therapist's id on a real creation, and null when the delivery was
 * a duplicate. The caller uses that to decide whether to send a welcome — Clerk
 * retries webhooks, and a second delivery must not mail the same person twice.
 */
export async function handleUserCreated(data: ClerkUserCreatedData): Promise<string | null> {
  const primary =
    data.email_addresses.find((e) => e.id === data.primary_email_address_id) ??
    data.email_addresses[0];
  const primaryEmail = primary?.email_address;

  if (!primaryEmail) {
    throw new Error(`Clerk user ${data.id} has no email address`);
  }

  // The same person coming back under a new Clerk identity — after deleting
  // their account, or after the Clerk instance itself was replaced (development
  // to production migrates no users). Their practice — slug, clients, bookings —
  // is keyed by email, and they should get it back rather than a second, empty
  // one; and without this the create below would trip the unique email index
  // and Clerk would retry the webhook forever, leaving them signed in with no
  // therapist row at all.
  //
  // Adoption is only granted on an address Clerk has verified: that is the
  // same proof of ownership a password reset accepts. An unverified match is
  // refused loudly instead of silently taking over someone's practice.
  const existing = await prisma.therapist.findUnique({
    where: { email: primaryEmail },
    select: { id: true, clerkUserId: true, status: true },
  });
  if (existing) {
    if (existing.clerkUserId === data.id) return null; // duplicate delivery
    if (primary.verification?.status !== "verified") {
      throw new Error(
        `Clerk user ${data.id} signed up with ${primaryEmail}, which belongs to an existing therapist, but the address is not verified`
      );
    }
    await prisma.therapist.update({
      where: { id: existing.id },
      data: {
        clerkUserId: data.id,
        // A soft-deleted practice comes back to life; a suspended one stays suspended.
        status: existing.status === "deleted" ? "active" : existing.status,
      },
    });
    return existing.id;
  }

  const fullName =
    [data.first_name, data.last_name].filter(Boolean).join(" ").trim() ||
    primaryEmail.split("@")[0];

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    try {
      const created = await prisma.therapist.create({
        data: {
          clerkUserId: data.id,
          email: primaryEmail,
          fullName,
          slug: generateFallbackSlug(),
          // Explicit rather than left to the column default, so the code constant
          // is the one place the product's language is decided.
          locale: DEFAULT_LOCALE,
          // Every account starts on the 30-day trial; the daily cron moves it on
          // from there (see src/lib/billing-lifecycle.ts).
          subscription: { create: { status: "trialing", trialEndsAt: trialEndFor(new Date()) } },
          settings: { create: {} },
        },
      });
      return created.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // A duplicate webhook delivery for the same Clerk user can collide on email or
        // clerk_user_id depending on which unique index Postgres validates first — check
        // existence directly instead of trusting which constraint the error reports.
        const existing = await prisma.therapist.findUnique({
          where: { clerkUserId: data.id },
          select: { id: true },
        });
        if (existing) return null; // duplicate webhook delivery — idempotent no-op
        if (isUniqueViolation(error, "slug")) continue; // collision on the random fallback slug — retry
      }
      throw error;
    }
  }

  throw new Error(`Could not allocate a unique fallback slug for Clerk user ${data.id}`);
}

export async function handleUserDeleted(data: { id?: string }) {
  if (!data.id) return;
  // Never hard-delete: future bookings and the public booking page must survive (spec 7.5, 11.3).
  await prisma.therapist.updateMany({
    where: { clerkUserId: data.id },
    data: { status: "deleted" },
  });
}
