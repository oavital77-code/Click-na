import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { confirmBookingByTherapist } from "@/lib/bookings";
import { writeBlocked } from "@/lib/require-access";

const STATUS_BY_ERROR: Record<string, number> = {
  not_found: 404,
  not_pending: 409,
};

/** The therapist confirms a booking that came in while auto-confirm was off. */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/bookings/[id]/confirm">) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({ where: { clerkUserId: userId } });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const blocked = await writeBlocked(therapist.id);
  if (blocked) return blocked;

  const { id } = await ctx.params;
  const result = await confirmBookingByTherapist(therapist.id, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: STATUS_BY_ERROR[result.error] });
  }
  return NextResponse.json({ ok: true });
}
