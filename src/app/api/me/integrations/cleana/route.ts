import { NextResponse } from "next/server";
import { requireTherapist } from "@/lib/route-auth";
import { cleanaLinkStatus, disconnectCleana } from "@/lib/cleana-link";

/**
 * The therapist disconnects Cleana from the add-ons page. Not gated on the
 * subscription: cutting a link must always be possible, even on a locked account.
 */
export async function DELETE() {
  const gate = await requireTherapist();
  if (!gate.ok) return gate.response;
  await disconnectCleana(gate.therapist.id);
  return NextResponse.json(await cleanaLinkStatus(gate.therapist.id));
}
