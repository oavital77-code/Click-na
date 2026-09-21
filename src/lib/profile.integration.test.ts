import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { updateProfile, checkSlugAvailability, resolveSlugRedirect } from "@/lib/profile";

describe("profile / slug redirects (against a live database)", () => {
  let therapistId: string;
  let otherTherapistId: string;

  beforeAll(async () => {
    const therapist = await prisma.therapist.create({
      data: {
        email: "profile-integration@example.com",
        fullName: "Profile Integration",
        slug: "profile-integration-test",
        subscription: { create: {} },
        settings: { create: {} },
      },
    });
    therapistId = therapist.id;

    const other = await prisma.therapist.create({
      data: {
        email: "profile-integration-2@example.com",
        fullName: "Other Therapist",
        slug: "profile-integration-other",
        subscription: { create: {} },
        settings: { create: {} },
      },
    });
    otherTherapistId = other.id;
  });

  afterAll(async () => {
    await prisma.slugRedirect.deleteMany({ where: { therapistId: { in: [therapistId, otherTherapistId] } } });
    await prisma.therapistSettings.deleteMany({ where: { therapistId: { in: [therapistId, otherTherapistId] } } });
    await prisma.subscription.deleteMany({ where: { therapistId: { in: [therapistId, otherTherapistId] } } });
    await prisma.therapist.deleteMany({ where: { id: { in: [therapistId, otherTherapistId] } } });
  });

  it("updating the profile without changing the slug never creates a redirect", async () => {
    const result = await updateProfile(therapistId, "profile-integration-test", null, {
      fullName: "שם מעודכן",
      phone: "0501234567",
      professionType: "coach",
      locale: "he",
      slug: "profile-integration-test",
    });
    expect(result.ok).toBe(true);

    const redirects = await prisma.slugRedirect.findMany({ where: { therapistId } });
    expect(redirects).toHaveLength(0);
  });

  it("changing the slug creates a 90-day redirect from the old slug", async () => {
    const result = await updateProfile(therapistId, "profile-integration-test", null, {
      fullName: "שם מעודכן",
      phone: "0501234567",
      professionType: "coach",
      locale: "he",
      slug: "profile-integration-new",
    });
    expect(result.ok).toBe(true);

    const redirect = await prisma.slugRedirect.findUniqueOrThrow({
      where: { oldSlug: "profile-integration-test" },
    });
    expect(redirect.therapistId).toBe(therapistId);

    const daysUntilExpiry = (redirect.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysUntilExpiry).toBeGreaterThan(89);
    expect(daysUntilExpiry).toBeLessThan(91);
  });

  it("resolveSlugRedirect resolves the old slug to the therapist's current slug", async () => {
    const resolved = await resolveSlugRedirect("profile-integration-test");
    expect(resolved).toBe("profile-integration-new");
  });

  it("resolveSlugRedirect returns null for a slug that was never redirected", async () => {
    expect(await resolveSlugRedirect("never-existed-xyz")).toBeNull();
  });

  it("a second slug change within the 30-day cooldown is rejected", async () => {
    const therapist = await prisma.therapist.findUniqueOrThrow({ where: { id: therapistId } });
    const result = await updateProfile(therapistId, therapist.slug, therapist.slugChangedAt, {
      fullName: "שם מעודכן",
      phone: "0501234567",
      professionType: "coach",
      locale: "he",
      slug: "profile-integration-third",
    });
    expect(result).toMatchObject({ ok: false, error: "SLUG_CHANGE_TOO_SOON" });
  });

  // Going back to an address you had before: the redirect row for it still
  // exists (they last 90 days), and creating it again tripped the unique
  // index and came back as "taken". The redirect is refreshed instead.
  it("changing back and forth reuses the redirect rather than colliding on it", async () => {
    const profile = { fullName: "שם מעודכן", phone: "0501234567", professionType: "coach" as const, locale: "he" as const };
    // Currently "profile-integration-new" with a redirect from "profile-integration-test".
    expect((await updateProfile(therapistId, "profile-integration-new", null, { ...profile, slug: "profile-integration-test" })).ok).toBe(true);
    const back = await updateProfile(therapistId, "profile-integration-test", null, { ...profile, slug: "profile-integration-new" });
    expect(back.ok).toBe(true);
    const redirect = await prisma.slugRedirect.findUniqueOrThrow({ where: { oldSlug: "profile-integration-test" } });
    expect(redirect.therapistId).toBe(therapistId);
    expect(redirect.expiresAt.getTime()).toBeGreaterThan(Date.now() + 89 * 24 * 60 * 60 * 1000);
  });

  it("checkSlugAvailability rejects a slug another therapist currently owns", async () => {
    const result = await checkSlugAvailability("profile-integration-other", therapistId);
    expect(result).toEqual({ available: false, reason: "taken" });
  });

  it("checkSlugAvailability rejects a slug that's actively redirecting to someone else", async () => {
    const result = await checkSlugAvailability("profile-integration-test", otherTherapistId);
    expect(result).toEqual({ available: false, reason: "taken" });
  });

  it("checkSlugAvailability allows the therapist to reuse their own current slug", async () => {
    const result = await checkSlugAvailability("profile-integration-new", therapistId);
    expect(result).toEqual({ available: true });
  });

  it("checkSlugAvailability rejects a reserved word", async () => {
    expect(await checkSlugAvailability("dashboard", therapistId)).toEqual({
      available: false,
      reason: "reserved",
    });
  });

  it("checkSlugAvailability rejects a malformed slug", async () => {
    expect(await checkSlugAvailability("Not Valid!", therapistId)).toEqual({
      available: false,
      reason: "format",
    });
  });
});
