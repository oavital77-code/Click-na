import { NextResponse, type NextRequest } from "next/server";
import { therapistForCleanaToken } from "@/lib/cleana-link";

/** Cleana asks whether its token for a therapist still works. 401 once disconnected here. */
export async function GET(request: NextRequest) {
  const therapistId = await therapistForCleanaToken(request.headers.get("authorization"));
  if (!therapistId) return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  return NextResponse.json({ connected: true }, { headers: { "cache-control": "no-store" } });
}
