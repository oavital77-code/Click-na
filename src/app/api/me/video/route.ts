import { NextResponse, type NextRequest } from "next/server";
import { getMessages, toLocale, translateIssue } from "@/i18n";
import { requireTherapist } from "@/lib/route-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { tooManyRequests } from "@/lib/http";
import { getVideoStatus, saveVideoSetup, videoSchema } from "@/lib/video";

/** Where online sessions stand: the method, its link, and whether clients will get a way in. */
export async function GET() {
  const gate = await requireTherapist();
  if (!gate.ok) return gate.response;
  return NextResponse.json({ video: await getVideoStatus(gate.therapist.id) });
}

/** Choose how online sessions are held, with the standing room link for the link methods. */
export async function POST(request: NextRequest) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  const limit = await checkRateLimit({ scope: "video-setup", identifier: therapist.id, limit: 30, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  const parsed = videoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const m = getMessages(toLocale(therapist.locale));
    return NextResponse.json({ error: translateIssue(m, parsed.error.issues[0]?.message) || m.common.genericError }, { status: 422 });
  }
  await saveVideoSetup(therapist.id, parsed.data);
  return NextResponse.json({ video: await getVideoStatus(therapist.id) });
}
