import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { profileSchema } from "@/lib/settings-schema";
import { updateProfile } from "@/lib/profile";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({
    where: { clerkUserId: userId },
    include: { subscription: true, settings: true },
  });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ therapist });
}

export async function PATCH(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({ where: { clerkUserId: userId } });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = profileSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });
  }

  const result = await updateProfile(therapist.id, therapist.slug, therapist.slugChangedAt, parsed.data);
  if (!result.ok) {
    const status = result.error === "SLUG_CHANGE_TOO_SOON" ? 429 : 409;
    return NextResponse.json(
      {
        error: result.error,
        ...(result.error === "SLUG_CHANGE_TOO_SOON"
          ? { nextAllowedAt: result.nextAllowedAt.toISOString() }
          : {}),
      },
      { status }
    );
  }

  return NextResponse.json({ therapist: result.therapist });
}
