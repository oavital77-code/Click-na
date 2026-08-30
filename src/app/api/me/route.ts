import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { profileSchema } from "@/lib/settings-schema";

const SLUG_COOLDOWN_DAYS = 30;

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
  const data = parsed.data;

  const changingSlug = data.slug !== therapist.slug;
  if (changingSlug && therapist.slugChangedAt) {
    const nextAllowed = new Date(
      therapist.slugChangedAt.getTime() + SLUG_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
    );
    if (nextAllowed > new Date()) {
      return NextResponse.json(
        { error: "SLUG_CHANGE_TOO_SOON", nextAllowedAt: nextAllowed.toISOString() },
        { status: 429 }
      );
    }
  }

  try {
    const updated = await prisma.therapist.update({
      where: { id: therapist.id },
      data: {
        fullName: data.fullName,
        phone: data.phone,
        professionType: data.professionType,
        slug: data.slug,
        ...(changingSlug ? { slugChangedAt: new Date() } : {}),
      },
    });
    return NextResponse.json({ therapist: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "slug_taken" }, { status: 409 });
    }
    throw error;
  }
}
