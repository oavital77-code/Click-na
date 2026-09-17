import { NextResponse, type NextRequest } from "next/server";
import { getCurrentTherapist } from "@/lib/auth";
import { writeBlocked } from "@/lib/require-access";
import { deleteTreatment } from "@/lib/treatments";

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/me/treatments/[id]">) {
  const therapist = await getCurrentTherapist();
  if (!therapist) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const blocked = await writeBlocked(therapist.id);
  if (blocked) return blocked;

  const { id } = await ctx.params;
  const deleted = await deleteTreatment(therapist.id, id);
  if (!deleted) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
