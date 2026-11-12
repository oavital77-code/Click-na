import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTherapist } from "@/lib/route-auth";

/**
 * The therapist's own clients, for booking one into a slot by hand. Name and
 * phone only — enough to tell two people apart in a list.
 */
export async function GET() {
  const gate = await requireTherapist();
  if (!gate.ok) return gate.response;

  const clients = await prisma.client.findMany({
    where: { therapistId: gate.therapist.id },
    select: { id: true, fullName: true, phone: true },
    orderBy: { fullName: "asc" },
    take: 500,
  });
  return NextResponse.json({ clients }, { headers: { "cache-control": "no-store" } });
}
