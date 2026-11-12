import { NextResponse, type NextRequest, after } from "next/server";
import { z } from "zod";
import { isUuid, notFoundJson } from "@/lib/ids";
import { bookSlotByTherapist } from "@/lib/bookings";
import { sendBookingCreatedNotifications } from "@/lib/notifications";
import { requireTherapist } from "@/lib/route-auth";

const note = z.string().trim().max(200).optional();
const bodySchema = z.union([
  z.object({ clientId: z.string().uuid(), note }),
  z.object({
    fullName: z.string().trim().min(2, "validation.nameTooShort").max(255),
    phone: z.string().trim().max(50).optional().or(z.literal("")),
    email: z.string().trim().toLowerCase().email("validation.emailInvalid").max(255).optional().or(z.literal("")),
    note,
  }),
]);

const STATUS: Record<string, number> = { not_found: 404, client_not_found: 404, SLOT_ALREADY_BOOKED: 409 };

/**
 * The therapist books a client into one of their own open slots by hand: one
 * from their list, or somebody new. The slot and the client are both checked
 * against the signed-in therapist (src/lib/bookings.ts).
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/sessions/[id]/book">) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  if (!isUuid(id)) return notFoundJson();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });
  }

  const result = await bookSlotByTherapist(gate.therapist.id, id, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] });

  // The client hears about it the way they would have had they booked themselves.
  after(() => sendBookingCreatedNotifications(result.booking.id));

  return NextResponse.json(
    { booking: { id: result.booking.id, clientName: result.booking.clientNameSnapshot, clientPhone: result.booking.clientPhoneSnapshot } },
    { status: 201 }
  );
}
