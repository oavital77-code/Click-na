import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({
    where: { clerkUserId: userId },
    omit: { clerkUserId: true },
    include: {
      settings: true,
      subscription: true,
      locations: true,
      availabilityRules: true,
      clients: true,
      bookings: { include: { session: true } },
    },
  });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json(therapist, {
    headers: {
      "Content-Disposition": `attachment; filename="cleana-export-${therapist.slug}.json"`,
    },
  });
}
