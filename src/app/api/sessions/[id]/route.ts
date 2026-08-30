import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({ status: z.enum(["open", "blocked"]) });

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/sessions/[id]">) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({ where: { clerkUserId: userId } });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });

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
  const allowedTransitions: Record<string, string> = { open: "blocked", blocked: "open" };
  if (allowedTransitions[session.status] !== parsed.data.status) {
    return NextResponse.json({ error: "invalid_transition" }, { status: 409 });
  }

  const updated = await prisma.session.update({
    where: { id },
    data: { status: parsed.data.status },
  });

  return NextResponse.json({ session: updated });
}
