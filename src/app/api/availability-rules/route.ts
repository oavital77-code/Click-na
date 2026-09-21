import { NextResponse, type NextRequest } from "next/server";
import { listRulesWithCounts, createRules } from "@/lib/availability-rules";
import { ruleCreateSchema } from "@/lib/availability-rule-schema";
import { requireTherapist } from "@/lib/route-auth";

export async function GET() {
  const gate = await requireTherapist();
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  const rules = await listRulesWithCounts(therapist.id);
  return NextResponse.json({ rules });
}

export async function POST(request: NextRequest) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  const parsed = ruleCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });
  }

  await createRules(therapist.id, parsed.data);
  return NextResponse.json({ ok: true }, { status: 201 });
}
