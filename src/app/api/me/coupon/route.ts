import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireTherapist } from "@/lib/route-auth";
import { applyCoupon } from "@/lib/coupons";
import { checkRateLimit } from "@/lib/rate-limit";
import { tooManyRequests } from "@/lib/http";

const bodySchema = z.object({ code: z.string().trim().min(1).max(40) });

/**
 * Enter a coupon. Open to a locked account too (no write gate): a lower price
 * is exactly what might get someone to pay and unlock. Limited per account so
 * codes cannot be guessed by trying.
 */
export async function POST(request: NextRequest) {
  const gate = await requireTherapist();
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  const limit = await checkRateLimit({ scope: "coupon", identifier: therapist.id, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 422 });

  const result = await applyCoupon(therapist.id, parsed.data.code);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ code: result.code, priceIls: result.priceIls });
}
