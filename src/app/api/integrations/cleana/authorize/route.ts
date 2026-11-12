import { NextResponse, type NextRequest } from "next/server";
import { requireTherapist } from "@/lib/route-auth";
import { cleanaLinkConfigured, cleanaReturnUrl, issueAuthorizationCode, validState } from "@/lib/cleana-link";

/**
 * The approve / not-now buttons on /connect/cleana. Same-origin form post from
 * a signed-in therapist (src/proxy.ts refuses cross-site writes to /api/).
 * Either way the browser goes back to Cleana's fixed return URL with the state
 * it came with; only an approval carries a code.
 */
export async function POST(request: NextRequest) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;

  const returnUrl = cleanaReturnUrl();
  if (!cleanaLinkConfigured() || !returnUrl) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const state = form?.get("state");
  if (!validState(state)) return NextResponse.json({ error: "invalid_state" }, { status: 400 });

  const target = new URL(returnUrl);
  target.searchParams.set("state", state);

  if (form?.get("decision") === "approve") {
    target.searchParams.set("code", await issueAuthorizationCode(gate.therapist.id));
  } else {
    target.searchParams.set("error", "access_denied");
  }

  // 303: the browser follows with a GET, not a re-POST of the form.
  return NextResponse.redirect(target, 303);
}
