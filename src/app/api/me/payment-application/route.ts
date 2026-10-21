import { NextResponse, type NextRequest } from "next/server";
import { toLocale } from "@/i18n";
import { requireTherapist } from "@/lib/route-auth";
import { getApplicationSummary, submitApplication } from "@/lib/payment-applications";

export async function GET() {
  const gate = await requireTherapist();
  if (!gate.ok) return gate.response;
  return NextResponse.json({ application: await getApplicationSummary(gate.therapist.id) });
}

export async function POST(request: NextRequest) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  const body = await request.json().catch(() => null);
  // Kept with the accepted terms as evidence of who agreed, from where.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const result = await submitApplication(therapist.id, body, { ip, locale: toLocale(therapist.locale) });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, fieldErrors: result.fieldErrors }, { status: 422 });
  }
  return NextResponse.json({ application: result.application });
}
