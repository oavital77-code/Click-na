import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { onboardingSchema } from "@/lib/onboarding-schema";

function toTimeValue(hhmm: string) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0));
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const therapist = await prisma.therapist.findUnique({ where: { clerkUserId: userId } });
  if (!therapist) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = onboardingSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.therapist.update({
        where: { id: therapist.id },
        data: {
          fullName: data.fullName,
          phone: data.phone,
          professionType: data.professionType,
          slug: data.slug,
          onboardingCompleted: true,
        },
      });

      await tx.therapistSettings.upsert({
        where: { therapistId: therapist.id },
        create: {
          therapistId: therapist.id,
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

      // Onboarding always writes the therapist's full current weekly availability,
      // so replacing rather than diffing keeps this idempotent and simple.
      await tx.availabilityRule.deleteMany({ where: { therapistId: therapist.id } });
      await tx.availabilityRule.createMany({
        data: data.availability.days.map((dayOfWeek) => ({
          therapistId: therapist.id,
          dayOfWeek,
          startTime: toTimeValue(data.availability.startTime),
          endTime: toTimeValue(data.availability.endTime),
          slotDurationMinutes: data.defaultDurationMinutes,
        })),
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "slug_taken" }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
