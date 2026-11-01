import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireTherapist } from "@/lib/route-auth";
import { isOwner } from "@/lib/payment-applications";
import { rapydKeys, rapydMode, rapydRequest } from "@/lib/rapyd";
import { disableRapydWallet, ensureRapydWallet } from "@/lib/rapyd-payments";

/**
 * The owner's Rapyd controls. `ping` is one signed, read-only call: success
 * means the keys and the signing are right. `enable` opens a wallet for the
 * owner's own account, so a payment can be tried end to end on a real
 * booking before therapists get the option; `disable` switches it off.
 * Owner-only, a 404 for everybody else.
 */
const bodySchema = z.object({ action: z.enum(["ping", "enable", "disable"]).default("ping") });

export async function POST(request: NextRequest) {
  const gate = await requireTherapist();
  if (!gate.ok) return gate.response;
  if (!isOwner(gate.therapist.email)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 422 });
  const mode = rapydMode();
  if (!rapydKeys()) return NextResponse.json({ ok: false, mode, errorCode: "NOT_CONFIGURED" });

  if (parsed.data.action === "disable") {
    await disableRapydWallet(gate.therapist.id);
    return NextResponse.json({ ok: true, mode, walletEnabled: false });
  }

  if (parsed.data.action === "enable") {
    const result = await ensureRapydWallet(gate.therapist.id);
    if (result.ok) return NextResponse.json({ ok: true, mode, walletEnabled: true });
    console.error("rapyd wallet failed", { errorCode: result.errorCode, message: result.message });
    return NextResponse.json({ ok: false, mode, errorCode: result.errorCode, message: result.message });
  }

  const result = await rapydRequest<unknown[]>("get", "/v1/data/countries");
  if (result.ok) return NextResponse.json({ ok: true, mode, countries: result.data.length });
  console.error("rapyd ping failed", { errorCode: result.errorCode, status: result.status });
  return NextResponse.json({ ok: false, mode, errorCode: result.errorCode, message: result.message });
}
