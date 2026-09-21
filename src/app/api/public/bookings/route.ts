import { NextResponse, type NextRequest, after } from "next/server";
import { z } from "zod";
import { createBooking } from "@/lib/bookings";
import { sendBookingCreatedNotifications } from "@/lib/notifications";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { tooManyRequests } from "@/lib/http";

const bookingSchema = z.object({
  sessionId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(255),
  // Whether one is needed is the therapist's setting; createBooking enforces it.
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  email: z.string().trim().toLowerCase().email().max(255),
  note: z.string().trim().max(200).optional(),
  // What the hold handed back. Absent, only an open (or lapsed-hold) slot can be taken.
  holdToken: z.string().trim().max(64).optional(),
});

const STATUS_BY_ERROR: Record<string, number> = {
  THERAPIST_NOT_FOUND: 404,
  BOOKING_TOO_SOON: 422,
  PHONE_REQUIRED: 422,
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

  after(() => sendBookingCreatedNotifications(result.booking.id));

  return NextResponse.json(
    {
      booking: {
        manageToken: result.booking.manageToken,
        startsAt: result.session.startsAt.toISOString(),
        endsAt: result.session.endsAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
