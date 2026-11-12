import { NextResponse, type NextRequest } from "next/server";
import { disconnectCleana, therapistForCleanaToken } from "@/lib/cleana-link";

/** The therapist disconnected on Cleana's side. Idempotent: an unknown token is already revoked. */
export async function POST(request: NextRequest) {
  const therapistId = await therapistForCleanaToken(request.headers.get("authorization"));
  if (therapistId) await disconnectCleana(therapistId);
  return NextResponse.json({ ok: true });
}
