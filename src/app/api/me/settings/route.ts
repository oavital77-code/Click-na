import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { settingsSchema } from "@/lib/settings-schema";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({
    where: { clerkUserId: userId },
    include: { settings: true },
  });
  if (!therapist?.settings) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ settings: therapist.settings });
}

export async function PATCH(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({ where: { clerkUserId: userId } });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = settingsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });
  }
  const data = parsed.data;

  const settings = await prisma.therapistSettings.update({
    where: { therapistId: therapist.id },
    data: {
      defaultDurationMinutes: data.defaultDurationMinutes,
      bufferBeforeMinutes: data.bufferBeforeMinutes,
      bufferAfterMinutes: data.bufferAfterMinutes,
      minNoticeHours: data.minNoticeHours,
      maxAdvanceDays: data.maxAdvanceDays,
      locationType: data.locationType,
      locationAddress: data.locationAddress || null,
      locationNotes: data.locationNotes || null,
      onlineMeetingUrl: data.onlineMeetingUrl || null,
      cancellationPolicyHours: data.cancellationPolicyHours,
      cancellationPolicyText: data.cancellationPolicyText || null,
      requirePhone: data.requirePhone,
      autoConfirm: data.autoConfirm,
      sendEmailConfirmation: data.sendEmailConfirmation,
      sendEmailReminder: data.sendEmailReminder,
      sendSmsReminder: data.sendSmsReminder,
      reminderHoursBefore: data.reminderHoursBefore,
      brandColor: data.brandColor || null,
      brandLogoUrl: data.brandLogoUrl || null,
      bookingPageHeadline: data.bookingPageHeadline || null,
      bookingPageDescription: data.bookingPageDescription || null,
    },
  });

  return NextResponse.json({ settings });
}
