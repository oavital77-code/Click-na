import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireTherapist } from "@/lib/route-auth";
import { approveApplication, isOwner, listApplications, rejectApplication } from "@/lib/payment-applications";

/**
 * The owner's review of card-payment applications. Signed in like any
 * therapist, then held to OWNER_NOTIFICATION_EMAIL — a 404 for everybody
 * else, so the route does not advertise that it exists.
 */
async function requireOwner() {
  const gate = await requireTherapist();
  if (!gate.ok) return gate;
  if (!isOwner(gate.therapist.email)) {
    return { ok: false as const, response: NextResponse.json({ error: "not found" }, { status: 404 }) };
  }
  return gate;
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    id: z.string().uuid(),
    credentials: z.record(z.string(), z.string()),
  }),
  z.object({ action: z.literal("reject"), id: z.string().uuid(), reason: z.string().min(1).max(500) }),
]);

export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.response;
  return NextResponse.json({ applications: await listApplications() });
}

export async function POST(request: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 422 });

  if (parsed.data.action === "approve") {
    const result = await approveApplication(parsed.data.id, parsed.data.credentials);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, fieldErrors: result.fieldErrors }, { status: 422 });
    }
  } else {
    const result = await rejectApplication(parsed.data.id, parsed.data.reason);
    if (!result.ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ applications: await listApplications() });
}
