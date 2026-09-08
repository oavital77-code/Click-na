import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { requestCancellation } from "@/lib/billing";

/** Stops future charges; the paid period runs to its end. */
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({ where: { clerkUserId: userId }, select: { id: true } });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const result = await requestCancellation(therapist.id);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[billing] cancellation failed", error);
    return NextResponse.json({ error: "provider_error" }, { status: 502 });
  }
}
