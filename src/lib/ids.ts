import { NextResponse } from "next/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a string from a URL can be a row id. The id columns are Postgres
 * `uuid`, which rejects anything else with an error, not an empty result: an
 * unchecked `/hold/abc` becomes a 500, and every 500 mails the operator — so
 * junk ids from a scanner would fill the hourly alert allowance and hide real
 * failures behind it. Checked first, a junk id is simply "not found".
 */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export const notFoundJson = () => NextResponse.json({ error: "not_found" }, { status: 404 });
