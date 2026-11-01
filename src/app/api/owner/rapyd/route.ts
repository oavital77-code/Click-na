import { NextResponse } from "next/server";
import { requireTherapist } from "@/lib/route-auth";
import { isOwner } from "@/lib/payment-applications";
import { rapydKeys, rapydMode, rapydRequest } from "@/lib/rapyd";

/**
 * The owner's connection check: one signed, read-only call to Rapyd. A
 * success means the keys in Vercel are right and the signing matches Rapyd's;
 * UNAUTHENTICATED_API_CALL means one of the two is not. Owner-only, 404 else.
 */
export async function POST() {
  const gate = await requireTherapist();
  if (!gate.ok) return gate.response;
  if (!isOwner(gate.therapist.email)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const mode = rapydMode();
  if (!rapydKeys()) return NextResponse.json({ ok: false, mode, errorCode: "NOT_CONFIGURED" });

  const result = await rapydRequest<unknown[]>("get", "/v1/data/countries");
  if (result.ok) return NextResponse.json({ ok: true, mode, countries: result.data.length });
  console.error("rapyd ping failed", { errorCode: result.errorCode, status: result.status });
  return NextResponse.json({ ok: false, mode, errorCode: result.errorCode, message: result.message });
}
