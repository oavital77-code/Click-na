import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentTherapist } from "@/lib/auth";
import { resetSchedule } from "@/lib/reset";

const bodySchema = z.object({
  scope: z.enum(["slots", "everything"]),
  // Deliberately required and explicit. This endpoint destroys data with no undo,
  // so a stray or replayed request without it does nothing.
  confirm: z.literal(true),
});

export async function POST(request: NextRequest) {
  const therapist = await getCurrentTherapist();
  if (!therapist) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 422 });
  }

  const summary = await resetSchedule(therapist.id, parsed.data.scope);
  return NextResponse.json({ ok: true, ...summary });
}
