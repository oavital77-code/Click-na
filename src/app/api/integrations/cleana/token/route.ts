import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { exchangeAuthorizationCode, isCleanaClient } from "@/lib/cleana-link";

const bodySchema = z.object({ code: z.string().max(300) });

/**
 * Step 3: Cleana's server swaps a one-time code for the therapist's access
 * token. Server to server only — authenticated by CLEANA_CLIENT_SECRET, never
 * reachable with a browser session.
 */
export async function POST(request: NextRequest) {
  if (!isCleanaClient(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const result = await exchangeAuthorizationCode(parsed.data.code);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json(
    { access_token: result.accessToken, token_type: "bearer", account_label: result.accountLabel },
    { headers: { "cache-control": "no-store" } }
  );
}
