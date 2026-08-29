import type { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { generateFallbackSlug } from "@/lib/slug";

const MAX_SLUG_ATTEMPTS = 5;

function isUniqueViolationOn(error: unknown, column: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    String(error.meta?.target).includes(column)
  );
}

async function handleUserCreated(data: {
  id: string;
  email_addresses: { id: string; email_address: string }[];
  primary_email_address_id: string | null;
  first_name: string | null;
  last_name: string | null;
}) {
  const primaryEmail =
    data.email_addresses.find((e) => e.id === data.primary_email_address_id)
      ?.email_address ?? data.email_addresses[0]?.email_address;

  if (!primaryEmail) {
    throw new Error(`Clerk user ${data.id} has no email address`);
  }

  const fullName =
    [data.first_name, data.last_name].filter(Boolean).join(" ").trim() ||
    primaryEmail.split("@")[0];

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    try {
      await prisma.therapist.create({
        data: {
          clerkUserId: data.id,
          email: primaryEmail,
          fullName,
          slug: generateFallbackSlug(),
          subscription: { create: {} },
          settings: { create: {} },
        },
      });
      return;
    } catch (error) {
      if (isUniqueViolationOn(error, "slug")) continue; // collision on the random fallback slug — retry
      if (isUniqueViolationOn(error, "clerk_user_id")) return; // duplicate webhook delivery — idempotent no-op
      throw error;
    }
  }

  throw new Error(`Could not allocate a unique fallback slug for Clerk user ${data.id}`);
}

async function handleUserDeleted(data: { id?: string }) {
  if (!data.id) return;
  // Never hard-delete: future bookings and the public booking page must survive (spec 7.5, 11.3).
  await prisma.therapist.updateMany({
    where: { clerkUserId: data.id },
    data: { status: "deleted" },
  });
}

export async function POST(request: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(request);
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }

  switch (event.type) {
    case "user.created":
      await handleUserCreated(event.data);
      break;
    case "user.deleted":
      await handleUserDeleted(event.data);
      break;
    default:
      break;
  }

  return new Response("ok", { status: 200 });
}
