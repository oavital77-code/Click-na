import { prisma } from "@/lib/prisma";
import { Prisma, type Therapist } from "@/generated/prisma/client";
import { RESERVED_SLUGS, SLUG_REGEX } from "@/lib/slug";
import type { ProfileInput } from "@/lib/settings-schema";

const SLUG_COOLDOWN_DAYS = 30;
const SLUG_REDIRECT_DAYS = 90;

export type SlugAvailability =
  | { available: true }
  | { available: false; reason: "format" | "reserved" | "taken" };

/**
 * A slug is unavailable if another therapist owns it now, or if it's still
 * redirecting to another therapist from a recent change (spec 11.3's 90-day
 * window) — otherwise two therapists could collide on the same old link.
 */
export async function checkSlugAvailability(
  slug: string,
  currentTherapistId: string | null
): Promise<SlugAvailability> {
  if (!SLUG_REGEX.test(slug)) return { available: false, reason: "format" };
  if (RESERVED_SLUGS.has(slug)) return { available: false, reason: "reserved" };

  const [existingTherapist, activeRedirect] = await Promise.all([
    prisma.therapist.findUnique({ where: { slug }, select: { id: true } }),
    prisma.slugRedirect.findFirst({
      where: { oldSlug: slug, expiresAt: { gt: new Date() } },
      select: { therapistId: true },
    }),
  ]);

  if (existingTherapist && existingTherapist.id !== currentTherapistId) {
    return { available: false, reason: "taken" };
  }
  if (activeRedirect && activeRedirect.therapistId !== currentTherapistId) {
    return { available: false, reason: "taken" };
  }
  return { available: true };
}

export type UpdateProfileResult =
  | { ok: true; therapist: Therapist }
  | { ok: false; error: "SLUG_CHANGE_TOO_SOON"; nextAllowedAt: Date }
  | { ok: false; error: "slug_taken" };

export async function updateProfile(
  therapistId: string,
  currentSlug: string,
  slugChangedAt: Date | null,
  input: ProfileInput
): Promise<UpdateProfileResult> {
  const changingSlug = input.slug !== currentSlug;

  if (changingSlug && slugChangedAt) {
    const nextAllowed = new Date(
      slugChangedAt.getTime() + SLUG_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
    );
    if (nextAllowed > new Date()) {
      return { ok: false, error: "SLUG_CHANGE_TOO_SOON", nextAllowedAt: nextAllowed };
    }
  }

  if (changingSlug) {
    const availability = await checkSlugAvailability(input.slug, therapistId);
    if (!availability.available) {
      return { ok: false, error: "slug_taken" };
    }
  }

  try {
    const therapist = await prisma.$transaction(async (tx) => {
      const updated = await tx.therapist.update({
        where: { id: therapistId },
        data: {
          fullName: input.fullName,
          phone: input.phone,
          professionType: input.professionType,
          locale: input.locale,
          slug: input.slug,
          ...(changingSlug ? { slugChangedAt: new Date() } : {}),
        },
      });

      if (changingSlug) {
        await tx.slugRedirect.create({
          data: {
            oldSlug: currentSlug,
            therapistId,
            expiresAt: new Date(Date.now() + SLUG_REDIRECT_DAYS * 24 * 60 * 60 * 1000),
          },
        });
      }

      return updated;
    });

    return { ok: true, therapist };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "slug_taken" };
    }
    throw error;
  }
}

/** Resolves the current slug for an expired/redirected old one, if any (spec 11.3). */
export async function resolveSlugRedirect(oldSlug: string) {
  const redirect = await prisma.slugRedirect.findFirst({
    where: { oldSlug, expiresAt: { gt: new Date() } },
    include: { therapist: { select: { slug: true, status: true } } },
  });
  if (!redirect || redirect.therapist.status !== "active") return null;
  return redirect.therapist.slug;
}
