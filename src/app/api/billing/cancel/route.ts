import { NextResponse } from "next/server";
import { requestCancellation } from "@/lib/billing";
import { requireTherapist } from "@/lib/route-auth";

/** Stops future charges; the paid period runs to its end. */
export async function POST() {
  const gate = await requireTherapist();
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  try {
    const result = await requestCancellation(therapist.id);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[billing] cancellation failed", error);
    return NextResponse.json({ error: "provider_error" }, { status: 502 });
  }
}
