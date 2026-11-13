import { NextResponse, type NextRequest } from "next/server";
import { isUuid, notFoundJson } from "@/lib/ids";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { moveSlot, releaseExpiredHolds } from "@/lib/bookings";
import { zonedDateTimeToUtc } from "@/lib/availability";
import { halfHourTimeSchema } from "@/lib/onboarding-schema";
import { SlotNotDeletableError, deleteSlot } from "@/lib/reset";
import { requireTherapist } from "@/lib/route-auth";

const patchSchema = z.union([
  z.object({
    status: z.enum(["open", "blocked"]),
    note: z.string().trim().max(80).optional(),
  }),
  // Changing when an empty slot takes place. On the half hour, like every time here.
  z
    .object({ date: z.iso.date(), startTime: halfHourTimeSchema, endTime: halfHourTimeSchema })
    .refine((d) => d.startTime < d.endTime),
]);

const MOVE_STATUS: Record<string, number> = {
  not_found: 404,
  not_movable: 409,
  from_cleana: 409,
  overlaps_existing: 409,
  in_past: 422,
};

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/sessions/[id]">) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 422 });
  }

  const { id } = await ctx.params;

  if (!isUuid(id)) return notFoundJson();
  await releaseExpiredHolds(therapist.id);

  if ("date" in parsed.data) {
    const moved = await moveSlot(
      therapist.id,
      id,
      zonedDateTimeToUtc(parsed.data.date, parsed.data.startTime, therapist.timezone),
      zonedDateTimeToUtc(parsed.data.date, parsed.data.endTime, therapist.timezone)
    );
    if (!moved.ok) return NextResponse.json({ error: moved.error }, { status: MOVE_STATUS[moved.error] });
    return NextResponse.json({ session: moved.session });
  }
  const change = parsed.data;

  const session = await prisma.session.findUnique({ where: { id } });

  if (!session || session.therapistId !== therapist.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Closing a booked slot needs the client-cancellation flow (spec 11.2) — not built yet.
  // A blocked slot can also stay blocked while its note is edited, not just transition.
  const allowedTransitions: Record<string, string> = { open: "blocked", blocked: "open" };
  const isNoteEdit = session.status === "blocked" && change.status === "blocked";
  if (!isNoteEdit && allowedTransitions[session.status] !== change.status) {
    return NextResponse.json({ error: "invalid_transition" }, { status: 409 });
  }

  // Conditional on the status read above: a client booking the slot in
  // between must not end up with a "blocked" slot holding a live booking.
  const changed = await prisma.session.updateMany({
    where: { id, therapistId: therapist.id, status: session.status },
    data: {
      status: change.status,
      blockedNote: change.status === "blocked" ? (change.note ?? null) : null,
    },
  });
  if (changed.count === 0) return NextResponse.json({ error: "invalid_transition" }, { status: 409 });
  const updated = await prisma.session.findUniqueOrThrow({ where: { id } });

  return NextResponse.json({ session: updated });
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/sessions/[id]">) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  const { id } = await ctx.params;

  if (!isUuid(id)) return notFoundJson();
  await releaseExpiredHolds(therapist.id);
  try {
    const deleted = await deleteSlot(therapist.id, id);
    if (!deleted) return NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    // A booked slot has a client behind it; deleting the row would strand their
    // booking and the confirmation they are holding.
    if (error instanceof SlotNotDeletableError) {
      return NextResponse.json({ error: "not_deletable" }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
