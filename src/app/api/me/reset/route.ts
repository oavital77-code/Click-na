import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { resetSchedule } from "@/lib/reset";
import { requireTherapist } from "@/lib/route-auth";

const bodySchema = z.object({
  scope: z.enum(["slots", "everything"]),
  // Deliberately required and explicit. This endpoint destroys data with no undo,
  // so a stray or replayed request without it does nothing.
  confirm: z.literal(true),
});

export async function POST(request: NextRequest) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 422 });
  }

  const summary = await resetSchedule(therapist.id, parsed.data.scope);
  return NextResponse.json({ ok: true, ...summary });
}
