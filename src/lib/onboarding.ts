import { prisma } from "@/lib/prisma";
import { generateOpenSessions, toTimeValue } from "@/lib/availability";
import { checkSlugAvailability } from "@/lib/profile";
import { isUniqueViolation } from "@/lib/prisma-errors";
import type { OnboardingInput } from "@/lib/onboarding-schema";

export type CompleteOnboardingResult = { ok: true } | { ok: false; error: "slug_taken" };

export async function completeOnboarding(
  therapistId: string,
  data: OnboardingInput
): Promise<CompleteOnboardingResult> {
  // Belt-and-suspenders: the DB's own unique constraint on therapists.slug is the real
  // backstop (P2002 below), but it doesn't know about slug_redirects — without this check,
  // onboarding could claim a slug that's still an active 90-day redirect for someone else.
  const availability = await checkSlugAvailability(data.slug, therapistId);
  if (!availability.available) {
    return { ok: false, error: "slug_taken" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.therapist.update({
        where: { id: therapistId },
        data: {
          fullName: data.fullName,
          phone: data.phone,
          professionType: data.professionType,
          slug: data.slug,
          onboardingCompleted: true,
        },
      });

      await tx.therapistSettings.upsert({
        where: { therapistId },
        create: {
          therapistId,
          defaultDurationMinutes: data.defaultDurationMinutes,
          locationType: data.locationType,
          locationAddress: data.locationAddress || null,
          onlineMeetingUrl: data.onlineMeetingUrl || null,
        },
        update: {
          defaultDurationMinutes: data.defaultDurationMinutes,
          locationType: data.locationType,
          locationAddress: data.locationAddress || null,
          onlineMeetingUrl: data.onlineMeetingUrl || null,
        },
      });

      // When given, onboarding writes the therapist's full current weekly
      // availability, so replacing rather than diffing keeps this idempotent and
      // simple. When skipped, nothing here is touched: the dashboard is where
      // they will open hours, and an empty schedule is a valid starting point.
      const availability = data.availability;
      if (availability) {
        await tx.availabilityRule.deleteMany({ where: { therapistId } });
        await tx.availabilityRule.createMany({
          data: availability.days.map((dayOfWeek) => ({
            therapistId,
            dayOfWeek,
            startTime: toTimeValue(availability.startTime),
            endTime: toTimeValue(availability.endTime),
            slotDurationMinutes: data.defaultDurationMinutes,
          })),
        });

        await generateOpenSessions(tx, therapistId);
      }
    });
  } catch (error) {
    if (isUniqueViolation(error, "slug")) {
      return { ok: false, error: "slug_taken" };
    }
    throw error;
  }

  return { ok: true };
}
