import { NextResponse } from "next/server";

/**
 * 429 with the Retry-After header clients and crawlers actually read, so a
 * throttled caller is told when to come back rather than left to guess.
 */
export function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "rate_limited", retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}
