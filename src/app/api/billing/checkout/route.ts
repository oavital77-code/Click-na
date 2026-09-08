import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { startCheckout } from "@/lib/billing";
import { PayPlusError } from "@/lib/payplus";

/** Opens a PayPlus payment page for the signed-in therapist and returns its URL. */
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({ where: { clerkUserId: userId }, select: { id: true } });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const result = await startCheckout(therapist.id);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
    return NextResponse.json({ url: result.url });
  } catch (error) {
    console.error("[billing] checkout failed", error instanceof PayPlusError ? { status: error.status, body: error.body } : error);
    return NextResponse.json({ error: "provider_error" }, { status: 502 });
  }
}
