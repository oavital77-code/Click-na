import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { therapistForCleanaToken } from "@/lib/cleana-link";
import { closeCleanaSlots } from "@/lib/cleana-slots";

const bodySchema = z.object({ bookingId: z.string().uuid() });

/**
 * The room at Cleana was cancelled or moved. Not gated on the subscription:
 * closing slots for a room that no longer exists must always go through.
 */
export async function POST(request: NextRequest) {
  const therapistId = await therapistForCleanaToken(request.headers.get("authorization"));
  if (!therapistId) return NextResponse.json({ error: "invalid_token" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  return NextResponse.json(await closeCleanaSlots(therapistId, parsed.data.bookingId), {
    headers: { "cache-control": "no-store" },
  });
}
