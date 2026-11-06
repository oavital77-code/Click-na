import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTherapist } from "@/lib/route-auth";

/**
 * The guided tour was finished or skipped: it is not started on their own
 * again. Replaying it from Settings calls this too, which changes nothing
 * once the date is set. Open to a locked account (no write gate): it is a
 * UI preference, not practice data.
 */
export async function POST() {
  const gate = await requireTherapist();
  if (!gate.ok) return gate.response;
  await prisma.therapist.updateMany({
    where: { id: gate.therapist.id, tourDoneAt: null },
    data: { tourDoneAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
