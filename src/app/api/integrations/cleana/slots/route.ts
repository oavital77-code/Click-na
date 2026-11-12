import { NextResponse, type NextRequest } from "next/server";
import { therapistForCleanaToken } from "@/lib/cleana-link";
import { bookedCleanaSlots, openCleanaSlots, openSlotsSchema, pgUuid } from "@/lib/cleana-slots";
import { writeBlocked } from "@/lib/require-access";
import { appUrl } from "@/lib/public-url";

/**
 * Cleana opens slots for a room the therapist booked there. The therapist is
 * the token's, never the body's: one therapist can only ever open their own.
 */
export async function POST(request: NextRequest) {
  const therapistId = await therapistForCleanaToken(request.headers.get("authorization"));
  if (!therapistId) return NextResponse.json({ error: "invalid_token" }, { status: 401 });

  // A locked account takes no new slots here either; Cleana says so to the therapist.
  if (await writeBlocked(therapistId)) {
    return NextResponse.json({ error: "subscription_inactive" }, { status: 402 });
  }

  const parsed = openSlotsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const result = await openCleanaSlots(therapistId, parsed.data);
  return NextResponse.json(
    { ...result, calendarUrl: `${appUrl()}/dashboard` },
    { headers: { "cache-control": "no-store" } }
  );
}

/**
 * Before a room is cancelled at Cleana: which of its slots a client has
 * booked here. Times only, never who — the warning there needs no more.
 */
export async function GET(request: NextRequest) {
  const therapistId = await therapistForCleanaToken(request.headers.get("authorization"));
  if (!therapistId) return NextResponse.json({ error: "invalid_token" }, { status: 401 });

  const bookingId = pgUuid.safeParse(request.nextUrl.searchParams.get("bookingId"));
  if (!bookingId.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  return NextResponse.json(
    { booked: await bookedCleanaSlots(therapistId, bookingId.data) },
    { headers: { "cache-control": "no-store" } }
  );
}
