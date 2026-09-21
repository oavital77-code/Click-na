import { NextResponse, type NextRequest } from "next/server";
import { deleteTreatment } from "@/lib/treatments";
import { requireTherapist } from "@/lib/route-auth";

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/me/treatments/[id]">) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  const { id } = await ctx.params;
  const deleted = await deleteTreatment(therapist.id, id);
  if (!deleted) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
