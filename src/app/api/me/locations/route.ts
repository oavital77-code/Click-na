import { NextResponse, type NextRequest } from "next/server";
import { createLocation, listLocations, locationSchema } from "@/lib/locations";
import { getMessages, toLocale, translateIssue } from "@/i18n";
import { requireTherapist } from "@/lib/route-auth";

export async function GET() {
  const gate = await requireTherapist();
  if (!gate.ok) return gate.response;
  const { therapist } = gate;
  return NextResponse.json({ locations: await listLocations(therapist.id) });
}

export async function POST(request: NextRequest) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  const parsed = locationSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    const m = getMessages(toLocale(therapist.locale));
    return NextResponse.json(
      { error: translateIssue(m, parsed.error.issues[0]?.message) || m.locations.invalid },
      { status: 422 }
    );
  }

  const location = await createLocation(therapist.id, parsed.data);
  return NextResponse.json({ location }, { status: 201 });
}
