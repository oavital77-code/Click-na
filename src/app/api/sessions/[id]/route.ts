import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { SlotNotDeletableError, deleteSlot } from "@/lib/reset";
import { writeBlocked } from "@/lib/require-access";

const patchSchema = z.object({
  status: z.enum(["open", "blocked"]),
  note: z.string().trim().max(80).optional(),
});

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/sessions/[id]">) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({ where: { clerkUserId: userId } });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const blocked = await writeBlocked(therapist.id);
  if (blocked) return blocked;

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 422 });
  }

  const { id } = await ctx.params;
  const session = await prisma.session.findUnique({ where: { id } });

  if (!session || session.therapistId !== therapist.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Closing a booked slot needs the client-cancellation flow (spec 11.2) — not built yet.
  // A blocked slot can also stay blocked while its note is edited, not just transition.
  const allowedTransitions: Record<string, string> = { open: "blocked", blocked: "open" };
  const isNoteEdit = session.status === "blocked" && parsed.data.status === "blocked";
  if (!isNoteEdit && allowedTransitions[session.status] !== parsed.data.status) {
    return NextResponse.json({ error: "invalid_transition" }, { status: 409 });
  }

  const updated = await prisma.session.update({
    where: { id },
    data: {
      status: parsed.data.status,
      blockedNote: parsed.data.status === "blocked" ? (parsed.data.note ?? null) : null,
    },
  });

  return NextResponse.json({ session: updated });
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/sessions/[id]">) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({ where: { clerkUserId: userId } });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const blocked = await writeBlocked(therapist.id);
  if (blocked) return blocked;

  const { id } = await ctx.params;
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
