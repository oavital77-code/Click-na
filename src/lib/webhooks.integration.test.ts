import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { handleUserCreated, handleUserDeleted } from "@/lib/webhooks";

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
  vi.restoreAllMocks();
});

function clerkUserId(name: string) {
  const id = `webhook_test_${name}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  createdClerkUserIds.push(id);
  return id;
}

describe("handleUserCreated (against a live database)", () => {
  it("creates a therapist with subscription and settings", async () => {
    const id = clerkUserId("basic");
    await handleUserCreated({
      id,
      email_addresses: [{ id: "ea_1", email_address: "webhook-test@example.com" }],
      primary_email_address_id: "ea_1",
      first_name: "לירון",
      last_name: "כהן",
    });

    const therapist = await prisma.therapist.findUnique({
      where: { clerkUserId: id },
      include: { subscription: true, settings: true },
    });
    expect(therapist).not.toBeNull();
    expect(therapist!.email).toBe("webhook-test@example.com");
    expect(therapist!.fullName).toBe("לירון כהן");
    expect(therapist!.slug).toMatch(/^t-[0-9a-f]{6}$/);
    expect(therapist!.onboardingCompleted).toBe(false);
    expect(therapist!.subscription).toMatchObject({ tier: "free", status: "active" });
    expect(therapist!.settings).not.toBeNull();
  });

  it("falls back to the email's local part when no name is given", async () => {
    const id = clerkUserId("noname");
    await handleUserCreated({
      id,
      email_addresses: [{ id: "ea_1", email_address: "just-an-email@example.com" }],
      primary_email_address_id: "ea_1",
      first_name: null,
      last_name: null,
    });

    const therapist = await prisma.therapist.findUniqueOrThrow({ where: { clerkUserId: id } });
    expect(therapist.fullName).toBe("just-an-email");
  });

  it("picks the primary email, not just the first one, when there are several", async () => {
    const id = clerkUserId("multiemail");
    await handleUserCreated({
      id,
      email_addresses: [
        { id: "ea_secondary", email_address: "secondary@example.com" },
        { id: "ea_primary", email_address: "primary@example.com" },
      ],
      primary_email_address_id: "ea_primary",
      first_name: "Test",
      last_name: null,
    });

    const therapist = await prisma.therapist.findUniqueOrThrow({ where: { clerkUserId: id } });
    expect(therapist.email).toBe("primary@example.com");
  });

  it("throws when the Clerk user has no email address at all", async () => {
    const id = clerkUserId("noemail");
    await expect(
      handleUserCreated({
        id,
        email_addresses: [],
        primary_email_address_id: null,
        first_name: "Test",
        last_name: null,
      })
    ).rejects.toThrow();

    const therapist = await prisma.therapist.findUnique({ where: { clerkUserId: id } });
    expect(therapist).toBeNull();
  });

  it("is idempotent: a duplicate user.created delivery for the same Clerk user is a no-op", async () => {
    const id = clerkUserId("dup");
    const input = {
      id,
      email_addresses: [{ id: "ea_1", email_address: "dup-test@example.com" }],
      primary_email_address_id: "ea_1",
      first_name: "Test",
      last_name: null,
    };

    await handleUserCreated(input);
    await expect(handleUserCreated(input)).resolves.not.toThrow();

    const count = await prisma.therapist.count({ where: { clerkUserId: id } });
    expect(count).toBe(1);
  });

  it("retries with a new slug when the random fallback collides with an existing one", async () => {
    const collidingId = clerkUserId("collision-seed");
    await handleUserCreated({
      id: collidingId,
      email_addresses: [{ id: "ea_1", email_address: "collision-seed@example.com" }],
      primary_email_address_id: "ea_1",
      first_name: "Seed",
      last_name: null,
    });
    const seedTherapist = await prisma.therapist.findUniqueOrThrow({
      where: { clerkUserId: collidingId },
    });

    const slugModule = await import("@/lib/slug");
    const spy = vi
      .spyOn(slugModule, "generateFallbackSlug")
      .mockReturnValueOnce(seedTherapist.slug) // first attempt collides
      .mockReturnValueOnce("t-abcdef"); // retry succeeds

    const id = clerkUserId("collision-retry");
    await handleUserCreated({
      id,
      email_addresses: [{ id: "ea_1", email_address: "collision-retry@example.com" }],
      primary_email_address_id: "ea_1",
      first_name: "Retry",
      last_name: null,
    });

    const therapist = await prisma.therapist.findUniqueOrThrow({ where: { clerkUserId: id } });
    expect(therapist.slug).toBe("t-abcdef");
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("handleUserDeleted (against a live database)", () => {
  it("soft-deletes: sets status to deleted without removing the row", async () => {
    const id = clerkUserId("delete-me");
    await handleUserCreated({
      id,
      email_addresses: [{ id: "ea_1", email_address: "delete-me@example.com" }],
      primary_email_address_id: "ea_1",
      first_name: "Delete",
      last_name: "Me",
    });

    await handleUserDeleted({ id });

    const therapist = await prisma.therapist.findUniqueOrThrow({ where: { clerkUserId: id } });
    expect(therapist.status).toBe("deleted");
    expect(therapist.fullName).toBe("Delete Me"); // untouched
  });

  it("is a no-op for an id matching no therapist", async () => {
    await expect(handleUserDeleted({ id: "no_such_clerk_user" })).resolves.not.toThrow();
  });

  it("is a no-op when no id is given", async () => {
    await expect(handleUserDeleted({})).resolves.not.toThrow();
  });
});
