import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createBooking } from "@/lib/bookings";

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
  const parsed = bookingSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });
  }

  const result = await createBooking(parsed.data.sessionId, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: STATUS_BY_ERROR[result.error] });
  }

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
