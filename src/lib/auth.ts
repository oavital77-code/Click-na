import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * Resolves the current therapist strictly from the verified Clerk session —
 * never from a client-supplied id (spec 5.3: therapist_id must never come
 * from the request body or a URL param on protected routes).
 */
export async function getCurrentTherapist() {
  const { userId } = await auth();
  if (!userId) return null;

  return prisma.therapist.findUnique({
    where: { clerkUserId: userId },
    include: { subscription: true, settings: true },
  });
}
