import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { RESERVED_SLUGS, SLUG_REGEX } from "@/lib/slug";

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

  if (!SLUG_REGEX.test(slug)) {
    return NextResponse.json({ available: false, reason: "format" });
  }
  if (RESERVED_SLUGS.has(slug)) {
    return NextResponse.json({ available: false, reason: "reserved" });
  }

  const existing = await prisma.therapist.findUnique({
    where: { slug },
    select: { clerkUserId: true },
  });
  const available = !existing || existing.clerkUserId === userId;

  return NextResponse.json({ available, reason: available ? undefined : "taken" });
}
