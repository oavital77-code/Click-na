import { NextResponse, type NextRequest } from "next/server";
import { settingsSchema } from "@/lib/settings-schema";
import { updateSettings } from "@/lib/settings";
import { applyHolidayPolicy } from "@/lib/holiday-slots";
import { requireTherapist } from "@/lib/route-auth";

export async function GET() {
  const gate = await requireTherapist();
  if (!gate.ok) return gate.response;
  if (!gate.therapist.settings) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ settings: gate.therapist.settings });
}

export async function PATCH(request: NextRequest) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  const parsed = settingsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });
  }

  const settings = await updateSettings(therapist.id, parsed.data);
  // Closed days take effect now, not at the next daily sweep.
  await applyHolidayPolicy(therapist.id);
  return NextResponse.json({ settings });
}
