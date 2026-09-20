import { NextResponse, type NextRequest } from "next/server";
import { getCurrentTherapist } from "@/lib/auth";
import { writeBlocked } from "@/lib/require-access";
import { archiveLocation, locationSchema, updateLocation } from "@/lib/locations";
import { getMessages, toLocale, translateIssue } from "@/i18n";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/me/locations/[id]">) {
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

  const { id } = await ctx.params;
  const location = await updateLocation(therapist.id, id, parsed.data);
  if (!location) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ location });
}

/** Archive, not delete: past bookings keep pointing at the place they happened. */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/me/locations/[id]">) {
  const therapist = await getCurrentTherapist();
  if (!therapist) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const blocked = await writeBlocked(therapist.id);
  if (blocked) return blocked;

  const { id } = await ctx.params;
  const result = await archiveLocation(therapist.id, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error === "NOT_FOUND" ? 404 : 409 });
  }
  return NextResponse.json({ ok: true, removedOpenSlots: result.removedOpenSlots, disabledRules: result.disabledRules });
}
