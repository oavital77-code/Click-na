import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/public/therapists/[slug]">) {
  const { slug } = await ctx.params;

  const therapist = await prisma.therapist.findUnique({
    where: { slug },
    include: { settings: true },
  });

  // Never distinguish "doesn't exist" from "exists but not bookable" — both are 404 to the public.
  if (!therapist || therapist.status !== "active" || !therapist.onboardingCompleted || !therapist.settings) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const s = therapist.settings;
  return NextResponse.json({
    therapist: {
      fullName: therapist.fullName,
      slug: therapist.slug,
      timezone: therapist.timezone,
      professionType: therapist.professionType,
      defaultDurationMinutes: s.defaultDurationMinutes,
      locationType: s.locationType,
      locationAddress: s.locationAddress,
      locationNotes: s.locationNotes,
      onlineMeetingUrl: s.onlineMeetingUrl,
      cancellationPolicyHours: s.cancellationPolicyHours,
      cancellationPolicyText: s.cancellationPolicyText,
      requirePhone: s.requirePhone,
      brandColor: s.brandColor,
      brandLogoUrl: s.brandLogoUrl,
      bookingPageHeadline: s.bookingPageHeadline,
      bookingPageDescription: s.bookingPageDescription,
    },
  });
}
