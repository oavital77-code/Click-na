import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTherapist } from "@/lib/route-auth";

/**
 * The "what's new" notice was closed: it is not shown again. Open to a locked
 * account (no write gate): it is a UI preference, not practice data.
 */
export async function POST() {
  const gate = await requireTherapist();
  if (!gate.ok) return gate.response;
  await prisma.therapist.update({ where: { id: gate.therapist.id }, data: { whatsNewSeenAt: new Date() } });
  return NextResponse.json({ ok: true });
}
