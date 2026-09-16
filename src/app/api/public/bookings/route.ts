import { NextResponse, type NextRequest, after } from "next/server";
import { z } from "zod";
import { createBooking } from "@/lib/bookings";
import { ensurePaymentUrl } from "@/lib/client-payments";
import { sendBookingCreatedNotifications } from "@/lib/notifications";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { tooManyRequests } from "@/lib/http";

const bookingSchema = z.object({
  sessionId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(255),
  phone: z.string().trim().min(7).max(50),
  email: z.string().trim().toLowerCase().email().max(255),
  note: z.string().trim().max(200).optional(),
});

const STATUS_BY_ERROR: Record<string, number> = {
  THERAPIST_NOT_FOUND: 404,
  BOOKING_TOO_SOON: 422,
  SLOT_ALREADY_BOOKED: 409,
};

export async function POST(request: NextRequest) {
  // Anyone on the internet can reach this, and every accepted call writes rows
  // and sends two emails. Ten an hour from one address is far above what a real
  // client does and far below what makes spamming worthwhile.
  const limit = await checkRateLimit({
    scope: "booking",
    identifier: clientIp(request.headers),
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  const parsed = bookingSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });
  }

  const result = await createBooking(parsed.data.sessionId, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: STATUS_BY_ERROR[result.error] });
  }

  // Before the response, not after: the pay button on the confirmation screen
  // is the moment the client is most likely to pay. It costs one provider
  // round-trip, bounded, and never fails the booking — a provider that is down
  // simply means no button, and the same link is offered again in the email.
  const payment = await ensurePaymentUrl(result.booking.id);

  after(() => sendBookingCreatedNotifications(result.booking.id));

  return NextResponse.json(
    {
      booking: {
        manageToken: result.booking.manageToken,
        startsAt: result.session.startsAt.toISOString(),
        endsAt: result.session.endsAt.toISOString(),
        paymentUrl: payment?.url ?? null,
        paymentAmountIls: payment?.amountIls ?? null,
      },
    },
    { status: 201 }
  );
}
