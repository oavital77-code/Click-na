import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTherapist } from "@/lib/route-auth";

const querySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export async function GET(request: NextRequest) {
  const gate = await requireTherapist();
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

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
