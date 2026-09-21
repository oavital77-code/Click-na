import { NextResponse, after, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { onboardingSchema } from "@/lib/onboarding-schema";
import { completeOnboarding } from "@/lib/onboarding";
import { sendOnboardingCompleteEmail } from "@/lib/account-emails";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const therapist = await prisma.therapist.findUnique({ where: { clerkUserId: userId } });
  if (!therapist) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // One-time door. Afterwards the slug changes only through the profile,
  // which enforces the cooldown and leaves a redirect from the old link, and
  // the hours change only through the availability screen.
  if (therapist.onboardingCompleted) {
    return NextResponse.json({ error: "already_completed" }, { status: 409 });
  }

  const parsed = onboardingSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });
  }

  const result = await completeOnboarding(therapist.id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  // The link only exists once onboarding succeeds, so this is the first moment
  // there is anything to send. After the response — the therapist should not
  // wait on an email to see their own dashboard.
  after(() => sendOnboardingCompleteEmail(therapist.id));

  return NextResponse.json({ ok: true });
}
