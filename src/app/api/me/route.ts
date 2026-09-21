import { NextResponse, type NextRequest } from "next/server";
import { profileSchema } from "@/lib/settings-schema";
import { updateProfile } from "@/lib/profile";
import { requireTherapist } from "@/lib/route-auth";

export async function GET() {
  const gate = await requireTherapist();
  if (!gate.ok) return gate.response;
  // The PayPlus identifiers are ours to charge with, not the therapist's to see.
  const { subscription, ...therapist } = gate.therapist;
  const visibleSubscription = subscription && {
    ...subscription,
    payplusTokenUid: undefined,
    payplusCustomerUid: undefined,
    payplusTerminalUid: undefined,
    payplusCashierUid: undefined,
    pendingPageRequestUids: undefined,
  };

  return NextResponse.json({ therapist: { ...therapist, subscription: visibleSubscription ?? null } });
}

export async function PATCH(request: NextRequest) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  const parsed = profileSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });
  }

  const result = await updateProfile(therapist.id, therapist.slug, therapist.slugChangedAt, parsed.data);
  if (!result.ok) {
    const status = result.error === "SLUG_CHANGE_TOO_SOON" ? 429 : 409;
    return NextResponse.json(
      {
        error: result.error,
        ...(result.error === "SLUG_CHANGE_TOO_SOON"
          ? { nextAllowedAt: result.nextAllowedAt.toISOString() }
          : {}),
      },
      { status }
    );
  }

  return NextResponse.json({ therapist: result.therapist });
}
