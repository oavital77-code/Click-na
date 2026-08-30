import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({ where: { clerkUserId: userId } });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const bookings = await prisma.booking.findMany({
    where: {
      therapistId: therapist.id,
      session: { startsAt: { gte: new Date(parsed.data.from), lt: new Date(parsed.data.to) } },
    },
    include: { session: true },
    orderBy: { session: { startsAt: "asc" } },
  });

  return NextResponse.json({ bookings });
}
