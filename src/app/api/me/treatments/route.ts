import { NextResponse, type NextRequest } from "next/server";
import { createTreatment, listTreatments, treatmentSchema } from "@/lib/treatments";
import { getMessages, toLocale, translateIssue } from "@/i18n";
import { requireTherapist } from "@/lib/route-auth";

export async function GET() {
  const gate = await requireTherapist();
  if (!gate.ok) return gate.response;
  const { therapist } = gate;
  return NextResponse.json({ treatments: await listTreatments(therapist.id) });
}

export async function POST(request: NextRequest) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  const parsed = treatmentSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    const m = getMessages(toLocale(therapist.locale));
    const first = parsed.error.issues[0];
    return NextResponse.json({ error: translateIssue(m, first?.message) || m.treatments.invalid }, { status: 422 });
  }

  const treatment = await createTreatment(therapist.id, parsed.data);
  return NextResponse.json({ treatment }, { status: 201 });
}
