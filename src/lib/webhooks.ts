import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { generateFallbackSlug } from "@/lib/slug";
import { isUniqueViolation } from "@/lib/prisma-errors";

const MAX_SLUG_ATTEMPTS = 5;

export type ClerkUserCreatedData = {
  id: string;
  email_addresses: { id: string; email_address: string }[];
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
  const primaryEmail =
    data.email_addresses.find((e) => e.id === data.primary_email_address_id)?.email_address ??
    data.email_addresses[0]?.email_address;

  if (!primaryEmail) {
    throw new Error(`Clerk user ${data.id} has no email address`);
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
          subscription: { create: {} },
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
