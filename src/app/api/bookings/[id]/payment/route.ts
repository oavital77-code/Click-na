import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { markBookingPaidByTherapist } from "@/lib/client-payments";
import { writeBlocked } from "@/lib/require-access";

const bodySchema = z.object({ paid: z.boolean() });

/**
 * The therapist's own word on whether a booking is paid. For a payment link
 * there is no provider to tell us, and cash at the door tells nobody; this is
 * how either ends up on the record.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/bookings/[id]/payment">) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({ where: { clerkUserId: userId } });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const blocked = await writeBlocked(therapist.id);
  if (blocked) return blocked;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 422 });

  const { id } = await ctx.params;
  const result = await markBookingPaidByTherapist(therapist.id, id, parsed.data.paid);
  if (!result.ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, paid: parsed.data.paid });
}
