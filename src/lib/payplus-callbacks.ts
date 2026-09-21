import { NextResponse } from "next/server";

/**
 * PayPlus signs its callbacks (HMAC over the raw body, in the `hash` header).
 * A body without the header is still verified against PayPlus before anything
 * is decided, but its unsigned hints help choose which account or booking the
 * money is credited to. Until the logs show that every real callback carries
 * the header, unsigned ones are let through and written down; once they do,
 * PAYPLUS_REQUIRE_SIGNED_CALLBACKS=true closes that door for good.
 *
 * Returns the response to send when the callback is refused, else null.
 */
export function unsignedCallbackRefused(
  route: "billing" | "client",
  env: Record<string, string | undefined> = process.env
): NextResponse | null {
  const required = env.PAYPLUS_REQUIRE_SIGNED_CALLBACKS === "true";
  console.warn(`[payplus] unsigned callback on the ${route} route`, { refused: required });
  if (!required) return null;
  return NextResponse.json({ error: "unsigned" }, { status: 401 });
}
