import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateRule, deleteRule } from "@/lib/availability-rules";
import { ruleUpdateSchema } from "@/lib/availability-rule-schema";
import { requireTherapist } from "@/lib/route-auth";

async function getOwnedRule(therapistId: string, ruleId: string) {
  const rule = await prisma.availabilityRule.findUnique({ where: { id: ruleId } });
  if (!rule || rule.therapistId !== therapistId) return null;
  return rule;
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/availability-rules/[id]">
) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  const { id } = await ctx.params;
  const existing = await getOwnedRule(therapist.id, id);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = ruleUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });
  }

  await updateRule(therapist.id, id, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/availability-rules/[id]">
) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  const { id } = await ctx.params;
  const existing = await getOwnedRule(therapist.id, id);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const removeFutureOpenSlots = request.nextUrl.searchParams.get("removeFutureOpenSlots") === "true";
  const result = await deleteRule(id, { removeFutureOpenSlots });

  return NextResponse.json({ ok: true, ...result });
}
