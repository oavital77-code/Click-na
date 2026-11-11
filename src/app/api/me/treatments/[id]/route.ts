import { NextResponse, type NextRequest } from "next/server";
import { isUuid, notFoundJson } from "@/lib/ids";
import { deleteTreatment } from "@/lib/treatments";
import { requireTherapist } from "@/lib/route-auth";

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/me/treatments/[id]">) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  const { id } = await ctx.params;

  if (!isUuid(id)) return notFoundJson();
  const deleted = await deleteTreatment(therapist.id, id);
  if (!deleted) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
