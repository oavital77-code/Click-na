import { NextResponse, type NextRequest } from "next/server";
import { mergeVerifiedWithHints, parseTransaction, payplusConfig, verifyCallbackSignature } from "@/lib/payplus";
import { applyVerifiedTransaction, verifyWithPayPlus } from "@/lib/billing";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { unsignedCallbackRefused } from "@/lib/payplus-callbacks";
import { tooManyRequests } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * PayPlus tells us a charge happened. We believe none of it until PayPlus,
 * asked directly with our keys, says the same — so a forged body can at most
 * make us look up a transaction id that PayPlus does not recognise.
 *
 * The signature check in front is a cheap first gate. It is required whenever
 * PayPlus sends the header; a body that arrives without one still has to pass
 * the authoritative lookup below, which is what actually decides anything.
 *
 * Always 200 once the message was understood, whatever we decided about it:
 * a non-2xx makes PayPlus retry, and a duplicate or a forgery is not something
 * a retry can fix.
 */
export async function POST(request: NextRequest) {
  const cfg = payplusConfig();
  if (!cfg) return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });

  // Every accepted body costs a lookup at PayPlus, so a flood is their bill and
  // our quota. PayPlus itself sends a handful a day and retries later on a 429.
  const limit = await checkRateLimit({
    scope: "payplus-callback",
    identifier: clientIp(request.headers),
    limit: 120,
    windowMs: 60 * 1000,
  });
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  const rawBody = await request.text();
  const hash = request.headers.get("hash");
  if (hash !== null && !verifyCallbackSignature(rawBody, { hash, userAgent: request.headers.get("user-agent") }, cfg.secretKey)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }
  if (hash === null) {
    const refused = unsignedCallbackRefused("billing");
    if (refused) return refused;
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const hinted = parseTransaction(body);
  if (!hinted.transactionUid) return NextResponse.json({ error: "no_transaction" }, { status: 400 });

  const verified = await verifyWithPayPlus(hinted.transactionUid);
  if (!verified) return NextResponse.json({ ok: false, reason: "unverified" });

  // Whatever the callback claimed, only what PayPlus confirmed counts — with the
  // hints used to fill identifiers PayPlus's reply may omit, and the account
  // hint only from a body PayPlus signed (see mergeVerifiedWithHints).
  const transaction = mergeVerifiedWithHints(verified.transaction, hinted, { signed: hash !== null });

  const result = await applyVerifiedTransaction(transaction, verified.raw);
  return NextResponse.json(result);
}
