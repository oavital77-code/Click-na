import { NextResponse } from "next/server";
import { getCurrentTherapist } from "@/lib/auth";
import { writeBlocked } from "@/lib/require-access";

type CurrentTherapist = NonNullable<Awaited<ReturnType<typeof getCurrentTherapist>>>;

export type TherapistGate =
  | { ok: true; therapist: CurrentTherapist }
  | { ok: false; response: NextResponse };

/**
 * The one door every therapist-facing route goes through.
 *
 * Twenty routes each spelled out the same three steps — Clerk session, the
 * therapist row behind it, the 402 that guards writes on a locked account —
 * in two slightly different dialects. One helper means one answer to "who is
 * calling and may they write", and one place to change it.
 *
 * Reads take `{}`; anything that changes data takes `{ write: true }`, which
 * adds the subscription check (see src/lib/require-access.ts).
 */
export async function requireTherapist(options: { write?: boolean } = {}): Promise<TherapistGate> {
  const therapist = await getCurrentTherapist();
  if (!therapist) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (options.write) {
    const blocked = await writeBlocked(therapist.id);
    if (blocked) return { ok: false, response: blocked };
  }
  return { ok: true, therapist };
}
