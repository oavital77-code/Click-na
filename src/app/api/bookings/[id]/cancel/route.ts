import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ reason: z.string().trim().max(500).optional() });

export async function POST(request: NextRequest, ctx: RouteContext<"/api/bookings/[id]/cancel">) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({ where: { clerkUserId: userId } });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { id } = await ctx.params;
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking || booking.therapistId !== therapist.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (booking.status === "canceled_by_client" || booking.status === "canceled_by_therapist") {
    return NextResponse.json({ error: "already_canceled" }, { status: 409 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 422 });
  }

  await prisma.$transaction([
    prisma.booking.update({
      where: { id },
      data: {
        status: "canceled_by_therapist",
        canceledAt: new Date(),
        cancellationReason: parsed.data.reason || null,
      },
    }),
    prisma.session.update({
      where: { id: booking.sessionId },
      data: { status: "open" },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
