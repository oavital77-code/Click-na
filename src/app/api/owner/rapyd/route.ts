import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireTherapist } from "@/lib/route-auth";
import { isOwner } from "@/lib/payment-applications";
import { rapydKeys, rapydMode, rapydRequest } from "@/lib/rapyd";

/**
 * The owner's Rapyd controls. `ping` is one signed, read-only call: success
 * means the keys and the signing are right. Owner-only, a 404 for everybody
 * else. Switching payments on is on the add-ons page, as for any therapist.
 */
const bodySchema = z.object({ action: z.literal("ping").default("ping") });

export async function POST(request: NextRequest) {
  const gate = await requireTherapist();
  if (!gate.ok) return gate.response;
  if (!isOwner(gate.therapist.email)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 422 });
  const mode = rapydMode();
  if (!rapydKeys()) return NextResponse.json({ ok: false, mode, errorCode: "NOT_CONFIGURED" });

  const result = await rapydRequest<unknown[]>("get", "/v1/data/countries");
  if (result.ok) return NextResponse.json({ ok: true, mode, countries: result.data.length });
  console.error("rapyd ping failed", { errorCode: result.errorCode, status: result.status });
  return NextResponse.json({ ok: false, mode, errorCode: result.errorCode, message: result.message });
}
