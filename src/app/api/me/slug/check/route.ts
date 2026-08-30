import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { checkSlugAvailability } from "@/lib/profile";

const bodySchema = z.object({ slug: z.string() });

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ available: false, reason: "invalid" }, { status: 400 });
  }

  const slug = parsed.data.slug.trim().toLowerCase();
  const therapist = await prisma.therapist.findUnique({
    where: { clerkUserId: userId },
    select: { id: true },
  });

  const result = await checkSlugAvailability(slug, therapist?.id ?? null);
  return NextResponse.json(result);
}
