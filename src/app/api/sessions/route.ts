import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { zonedDateTimeToUtc } from "@/lib/availability";
import { isExclusionViolation } from "@/lib/prisma-errors";

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

  const sessions = await prisma.session.findMany({
    where: {
      therapistId: therapist.id,
      startsAt: { gte: new Date(parsed.data.from), lt: new Date(parsed.data.to) },
    },
    include: { booking: true },
    orderBy: { startsAt: "asc" },
  });

  return NextResponse.json({ sessions });
}

const createSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .refine((d) => d.startTime < d.endTime, { message: "end must be after start", path: ["endTime"] });

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({ where: { clerkUserId: userId } });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });
  }

  const startsAt = zonedDateTimeToUtc(parsed.data.date, parsed.data.startTime, therapist.timezone);
  const endsAt = zonedDateTimeToUtc(parsed.data.date, parsed.data.endTime, therapist.timezone);

  if (startsAt < new Date()) {
    return NextResponse.json({ error: "in_past" }, { status: 422 });
  }

  try {
    const session = await prisma.session.create({
      data: { therapistId: therapist.id, startsAt, endsAt },
    });
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    if (isExclusionViolation(error, "sessions_no_overlap")) {
      return NextResponse.json({ error: "overlaps_existing" }, { status: 409 });
    }
    throw error;
  }
}
