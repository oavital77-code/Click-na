import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { cancelBookingByTherapist } from "@/lib/bookings";

const bodySchema = z.object({ reason: z.string().trim().max(500).optional() });

const STATUS_BY_ERROR: Record<string, number> = {
  not_found: 404,
  already_canceled: 409,
};

export async function POST(request: NextRequest, ctx: RouteContext<"/api/bookings/[id]/cancel">) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({ where: { clerkUserId: userId } });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 422 });
  }

  const { id } = await ctx.params;
  const result = await cancelBookingByTherapist(therapist.id, id, parsed.data.reason);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: STATUS_BY_ERROR[result.error] });
  }

  return NextResponse.json({ ok: true });
}
