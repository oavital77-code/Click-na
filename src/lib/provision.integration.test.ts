import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { provisionTherapist, type ClerkUserFetcher } from "@/lib/provision";
import { handleUserCreated } from "@/lib/webhooks";

const createdClerkUserIds: string[] = [];

afterEach(async () => {
  if (createdClerkUserIds.length === 0) return;
  const therapists = await prisma.therapist.findMany({
    where: { clerkUserId: { in: createdClerkUserIds } },
  });
  const ids = therapists.map((t) => t.id);
  await prisma.therapistSettings.deleteMany({ where: { therapistId: { in: ids } } });
  await prisma.subscription.deleteMany({ where: { therapistId: { in: ids } } });
  await prisma.therapist.deleteMany({ where: { id: { in: ids } } });
  createdClerkUserIds.length = 0;
});

function clerkUserId(name: string) {
  const id = `provision_test_${name}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  createdClerkUserIds.push(id);
  return id;
}

/** A stand-in for Clerk's backend API: the fetcher the real code would call. */
function clerkReturning(email: string, verified = true): ClerkUserFetcher {
  return async (id) => ({
    id,
    email_addresses: [
      { id: "ea_1", email_address: email, verification: { status: verified ? "verified" : "unverified" } },
    ],
    primary_email_address_id: "ea_1",
    first_name: "Provisioned",
    last_name: null,
  });
}

describe("provisionTherapist (against a live database)", () => {
  it("creates the therapist when the webhook never did", async () => {
    const id = clerkUserId("fresh");
    const result = await provisionTherapist(id, clerkReturning("provision-fresh@example.com"));

    expect(result).not.toBeNull();
    const therapist = await prisma.therapist.findUniqueOrThrow({
      where: { clerkUserId: id },
      include: { subscription: true, settings: true },
    });
    expect(therapist.email).toBe("provision-fresh@example.com");
    expect(therapist.subscription).not.toBeNull();
    expect(therapist.settings).not.toBeNull();
  });

  it("adopts the existing practice when the email is already known — the migration case", async () => {
    const oldId = clerkUserId("adopt-old");
    await handleUserCreated({
      id: oldId,
      email_addresses: [{ id: "ea_0", email_address: "provision-adopt@example.com", verification: { status: "verified" } }],
      primary_email_address_id: "ea_0",
      first_name: "Or",
      last_name: "Avital",
    });
    const before = await prisma.therapist.findUniqueOrThrow({ where: { clerkUserId: oldId } });

    const newId = clerkUserId("adopt-new");
    const result = await provisionTherapist(newId, clerkReturning("provision-adopt@example.com"));

    expect(result).toBe(before.id);
    const after = await prisma.therapist.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.clerkUserId).toBe(newId);
    expect(after.slug).toBe(before.slug);
    expect(after.fullName).toBe("Or Avital"); // the practice's own details win over Clerk's
  });

  it("is a no-op when the webhook already did the work", async () => {
    const id = clerkUserId("already");
    await provisionTherapist(id, clerkReturning("provision-already@example.com"));
    const again = await provisionTherapist(id, clerkReturning("provision-already@example.com"));

    expect(again).toBeNull();
    expect(await prisma.therapist.count({ where: { clerkUserId: id } })).toBe(1);
  });

  it("does nothing when Clerk knows no such user", async () => {
    const id = clerkUserId("ghost");
    const result = await provisionTherapist(id, async () => null);
    expect(result).toBeNull();
    expect(await prisma.therapist.findUnique({ where: { clerkUserId: id } })).toBeNull();
  });

  it("refuses to adopt on an unverified email, exactly like the webhook", async () => {
    const oldId = clerkUserId("guard-old");
    await handleUserCreated({
      id: oldId,
      email_addresses: [{ id: "ea_0", email_address: "provision-guard@example.com", verification: { status: "verified" } }],
      primary_email_address_id: "ea_0",
      first_name: "Owner",
      last_name: null,
    });
    const newId = clerkUserId("guard-new");
    await expect(
      provisionTherapist(newId, clerkReturning("provision-guard@example.com", false))
    ).rejects.toThrow(/not verified/);
    const row = await prisma.therapist.findUniqueOrThrow({ where: { email: "provision-guard@example.com" } });
    expect(row.clerkUserId).toBe(oldId);
  });
});
