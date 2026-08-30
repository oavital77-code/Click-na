import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const HOLD_MINUTES = 10;

export async function POST(_request: NextRequest, ctx: RouteContext<"/api/public/sessions/[id]/hold">) {
  const { id } = await ctx.params;
  const now = new Date();
  const holdExpiresAt = new Date(now.getTime() + HOLD_MINUTES * 60 * 1000);

  // Reclaim the slot only if it's genuinely free: open, or held by someone whose hold already expired.
  // Never widen this to accept a live 'held' — that would let two visitors hold the same slot at once.
  const claimed = await prisma.session.updateMany({
    where: {
      id,
      OR: [{ status: "open" }, { status: "held", holdExpiresAt: { lt: now } }],
    },
    data: { status: "held", holdExpiresAt },
  });

  if (claimed.count === 0) {
    const session = await prisma.session.findUnique({ where: { id }, select: { status: true } });
    const code = session?.status === "booked" ? "SLOT_ALREADY_BOOKED" : "SLOT_ON_HOLD";
    return NextResponse.json({ error: code }, { status: 409 });
  }

  return NextResponse.json({ holdExpiresAt: holdExpiresAt.toISOString() });
}
