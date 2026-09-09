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
    // PayPlus's own one-line reason (e.g. a wrong page uid) is safe to show and
    // is what makes a misconfiguration diagnosable from the screen.
    return NextResponse.json({ error: "provider_error", detail: error instanceof PayPlusError ? providerDetail(error) : null }, { status: 502 });
  }
}

function providerDetail(error: PayPlusError): string {
  const body = error.body as { results?: { description?: unknown; status?: unknown; code?: unknown }; message?: unknown } | string | null;
  if (typeof body === "string") return `${error.status}: ${body.slice(0, 200)}`;
  const results = body?.results;
  const parts = [results?.status, results?.code, results?.description, body?.message].filter((p) => typeof p === "string" || typeof p === "number");
  return `${error.status}${parts.length ? ": " + parts.join(" · ") : ""}`;
}
