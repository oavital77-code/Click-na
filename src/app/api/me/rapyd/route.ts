import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireTherapist } from "@/lib/route-auth";
import { disableRapydWallet, enableRapydPayments, rapydPaymentsState, rapydSignupOpen } from "@/lib/rapyd-payments";

/**
 * A therapist switching card payments on or off. On opens their Rapyd wallet
 * the first time and records the terms they accepted; off keeps the wallet,
 * so switching back on is one click. 404 to anyone the option is not open to.
 */
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enable"), acceptTerms: z.boolean().default(false) }),
  z.object({ action: z.literal("disable") }),
]);

export async function POST(request: NextRequest) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;
  const { therapist } = gate;
  if (!rapydSignupOpen(therapist.email)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 422 });

  if (parsed.data.action === "disable") {
    await disableRapydWallet(therapist.id);
    return NextResponse.json({ state: await rapydPaymentsState(therapist) });
  }

  // Kept with the accepted terms as evidence of who agreed, from where.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const result = await enableRapydPayments(therapist.id, { accepted: parsed.data.acceptTerms, ip });
  if (!result.ok) {
    if (result.errorCode !== "TERMS_REQUIRED") console.error("rapyd enable failed", { errorCode: result.errorCode, message: result.message });
    return NextResponse.json(
      { error: result.errorCode, state: await rapydPaymentsState(therapist) },
      { status: result.errorCode === "TERMS_REQUIRED" ? 422 : 502 }
    );
  }
  return NextResponse.json({ state: await rapydPaymentsState(therapist) });
}
