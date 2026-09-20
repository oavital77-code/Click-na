import { NextResponse, type NextRequest } from "next/server";
import { getCurrentTherapist } from "@/lib/auth";
import { writeBlocked } from "@/lib/require-access";
import { createLocation, listLocations, locationSchema } from "@/lib/locations";
import { getMessages, toLocale, translateIssue } from "@/i18n";

export async function GET() {
  const therapist = await getCurrentTherapist();
  if (!therapist) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ locations: await listLocations(therapist.id) });
}

export async function POST(request: NextRequest) {
  const therapist = await getCurrentTherapist();
  if (!therapist) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const blocked = await writeBlocked(therapist.id);
  if (blocked) return blocked;

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
