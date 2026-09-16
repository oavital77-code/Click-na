import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCredentials } from "@/lib/integrations";
import { payplusConfigFor } from "@/lib/integration-verify";
import { mergeVerifiedWithHints, parseTransaction, verifyCallbackSignature } from "@/lib/payplus";
import { applyClientPayment, verifyClientTransactionWithPayPlus } from "@/lib/client-payments";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { tooManyRequests } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * PayPlus reports that a client paid a therapist. Same posture as the platform
 * billing callback (src/app/api/billing/payplus/callback), with one twist: the
 * keys that decide are the *therapist's*, and which therapist's is itself read
 * from the body before anything is trusted.
 *
 * That is safe because of what the lookup key is. `page_request_uid` is an id
 * we minted and stored on exactly one booking; a forged one finds no booking
 * and stops here. A real one leads to a therapist whose own secret then has to
 * sign the body, and whose own API then has to confirm the transaction.
 *
 * Always 200 once the message was understood: a non-2xx makes PayPlus retry,
 * and neither a duplicate nor a forgery gets better with retries.
 */
export async function POST(request: NextRequest) {
  const limit = await checkRateLimit({
    scope: "client-payplus-callback",
    identifier: clientIp(request.headers),
    limit: 120,
    windowMs: 60 * 1000,
  });
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  const rawBody = await request.text();
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const hinted = parseTransaction(body);
  if (!hinted.transactionUid) return NextResponse.json({ error: "no_transaction" }, { status: 400 });
  if (!hinted.pageRequestUid) return NextResponse.json({ ok: false, reason: "no_page_request" });

  const booking = await prisma.booking.findUnique({
    where: { paymentPageRequestUid: hinted.pageRequestUid },
    select: { id: true, therapistId: true },
  });
  if (!booking) return NextResponse.json({ ok: false, reason: "unknown_booking" });

  const creds = await getCredentials(booking.therapistId, "payplus");
  if (!creds) return NextResponse.json({ ok: false, reason: "not_connected" });
  const cfg = payplusConfigFor(creds);

  const hash = request.headers.get("hash");
  if (hash !== null && !verifyCallbackSignature(rawBody, { hash, userAgent: request.headers.get("user-agent") }, cfg.secretKey)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  const verified = await verifyClientTransactionWithPayPlus(cfg, hinted.transactionUid);
  if (!verified) return NextResponse.json({ ok: false, reason: "unverified" });

  const transaction = mergeVerifiedWithHints(verified.transaction, hinted, { signed: hash !== null });
  // PayPlus's own reply names the page the charge came from. If it names a
  // different one, this transaction is real but is not this booking's.
  if (transaction.pageRequestUid && transaction.pageRequestUid !== hinted.pageRequestUid) {
    return NextResponse.json({ ok: false, reason: "page_mismatch" });
  }

  const result = await applyClientPayment(booking.id, "payplus", transaction, verified.raw);
  return NextResponse.json(result);
}
