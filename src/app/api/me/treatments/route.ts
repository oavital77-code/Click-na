import { NextResponse, type NextRequest } from "next/server";
import { getCurrentTherapist } from "@/lib/auth";
import { writeBlocked } from "@/lib/require-access";
import { createTreatment, listTreatments, treatmentSchema } from "@/lib/treatments";
import { getMessages, toLocale, translateIssue } from "@/i18n";

export async function GET() {
  const therapist = await getCurrentTherapist();
  if (!therapist) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ treatments: await listTreatments(therapist.id) });
}

export async function POST(request: NextRequest) {
  const therapist = await getCurrentTherapist();
  if (!therapist) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const blocked = await writeBlocked(therapist.id);
  if (blocked) return blocked;

  const parsed = treatmentSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    const m = getMessages(toLocale(therapist.locale));
    const first = parsed.error.issues[0];
    return NextResponse.json({ error: translateIssue(m, first?.message) || m.treatments.invalid }, { status: 422 });
  }

  const treatment = await createTreatment(therapist.id, parsed.data);
  return NextResponse.json({ treatment }, { status: 201 });
}
