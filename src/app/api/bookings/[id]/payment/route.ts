import { NextResponse, type NextRequest, after } from "next/server";
import { z } from "zod";
import { markBookingPaidByTherapist, requestPayment } from "@/lib/client-payments";
import { sendPaymentRequestNotifications } from "@/lib/notifications";
import { requireTherapist } from "@/lib/route-auth";

const bodySchema = z.discriminatedUnion("action", [
  // After the session: ask the client to pay this much, under this name.
  z.object({
    action: z.literal("request"),
    amountIls: z.number().min(1).max(100000).multipleOf(0.01),
    label: z.string().trim().max(80).nullable().optional(),
  }),
  // The therapist's own word — a link provider cannot tell us, and cash tells nobody.
  z.object({ action: z.literal("mark"), paid: z.boolean() }),
]);

const STATUS_BY_ERROR: Record<string, number> = {
  NOT_FOUND: 404,
  CANCELED: 409,
  ALREADY_PAID: 409,
  NOT_CONNECTED: 412,
  PROVIDER: 502,
};

export async function POST(request: NextRequest, ctx: RouteContext<"/api/bookings/[id]/payment">) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });

  const { id } = await ctx.params;

  if (parsed.data.action === "mark") {
    const result = await markBookingPaidByTherapist(therapist.id, id, parsed.data.paid);
    if (!result.ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, paid: parsed.data.paid });
  }

  const result = await requestPayment(therapist.id, id, {
    amountIls: parsed.data.amountIls,
    label: parsed.data.label ?? null,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, detail: result.detail }, { status: STATUS_BY_ERROR[result.error] });
  }

  // Email (and WhatsApp, with the add-on) go out after the response; the
  // therapist's own wa.me tap is what they see first, and it needs only the URL.
  after(() => sendPaymentRequestNotifications(id));

  return NextResponse.json({ ok: true, url: result.url, amountIls: result.amountIls, requestedAt: new Date().toISOString() });
}
