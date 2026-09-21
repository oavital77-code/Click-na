import { NextResponse } from "next/server";
import { requireTherapist } from "@/lib/route-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const gate = await requireTherapist();
  if (!gate.ok) return gate.response;

  const therapist = await prisma.therapist.findUnique({
    where: { id: gate.therapist.id },
    omit: { clerkUserId: true },
    include: {
      settings: true,
      // The PayPlus identifiers are ours to charge with, not the therapist's to keep.
      subscription: { omit: { payplusTokenUid: true, payplusCustomerUid: true, payplusTerminalUid: true, payplusCashierUid: true, pendingPageRequestUids: true } },
      locations: true,
      availabilityRules: true,
      clients: true,
      bookings: { include: { session: true } },
    },
  });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json(therapist, {
    headers: {
      "Content-Disposition": `attachment; filename="cleana-export-${therapist.slug}.json"`,
    },
  });
}
