import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Rapyd, the marketplace way card payments are meant to work: Cleana+ holds
 * the Rapyd account, every therapist gets a wallet under it, and a client's
 * payment lands in that wallet. This file is only the wire: signed requests
 * out and signed webhooks in. What is built on top of it lives elsewhere.
 *
 * Keys come from RAPYD_ACCESS_KEY / RAPYD_SECRET_KEY. Requests go to the
 * sandbox unless RAPYD_ENV is "production", so a live key never meets test
 * code by accident and the sandbox keys never reach real money.
 */
export const RAPYD_SANDBOX_URL = "https://sandboxapi.rapyd.net";
export const RAPYD_PRODUCTION_URL = "https://api.rapyd.net";

type Env = Record<string, string | undefined>;

export type RapydKeys = { accessKey: string; secretKey: string };

export function rapydKeys(env: Env = process.env): RapydKeys | null {
  const accessKey = env.RAPYD_ACCESS_KEY?.trim();
  const secretKey = env.RAPYD_SECRET_KEY?.trim();
  return accessKey && secretKey ? { accessKey, secretKey } : null;
}

export function rapydMode(env: Env = process.env): "sandbox" | "production" {
  return env.RAPYD_ENV?.trim().toLowerCase() === "production" ? "production" : "sandbox";
}

export function rapydBaseUrl(env: Env = process.env): string {
  return rapydMode(env) === "production" ? RAPYD_PRODUCTION_URL : RAPYD_SANDBOX_URL;
}

/**
 * Rapyd's signature: HMAC-SHA256 over the concatenated parts, written out as
 * lowercase hex, and that hex text then Base64-encoded (not the raw digest).
 */
export function rapydSignature(parts: string[], secretKey: string): string {
  const hex = createHmac("sha256", secretKey).update(parts.join("")).digest("hex");
  return Buffer.from(hex, "utf8").toString("base64");
}

/** A salt of the 8–16 characters Rapyd asks for, alphanumeric only. */
export function rapydSalt(): string {
  return randomBytes(12).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").padEnd(12, "0").slice(0, 12);
}

/**
 * The headers for one request. The body must be the exact string that is
 * sent — compact JSON, and empty (not "{}") when there is no body.
 */
export function signRequest(
  keys: RapydKeys,
  method: string,
  path: string,
  body: string,
  opts: { salt?: string; timestamp?: number } = {}
): Record<string, string> {
  const salt = opts.salt ?? rapydSalt();
  const timestamp = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const signature = rapydSignature(
    [method.toLowerCase(), path, salt, timestamp, keys.accessKey, keys.secretKey, body],
    keys.secretKey
  );
  return {
    "Content-Type": "application/json",
    access_key: keys.accessKey,
    salt,
    timestamp,
    signature,
  };
}

export type RapydResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; errorCode: string; message: string };

type RapydEnvelope<T> = {
  status?: { status?: string; error_code?: string; message?: string; operation_id?: string };
  data?: T;
};

/**
 * One call to Rapyd. Never throws: a network failure, missing keys or a Rapyd
 * error all come back as `ok: false` with Rapyd's own error code, which is
 * what is useful in a log (UNAUTHENTICATED_API_CALL means the keys or the
 * signature are wrong).
 */
export async function rapydRequest<T>(
  method: "get" | "post" | "put" | "delete",
  path: string,
  body?: unknown,
  opts: { env?: Env; idempotency?: string; fetchImpl?: typeof fetch } = {}
): Promise<RapydResult<T>> {
  const env = opts.env ?? process.env;
  const keys = rapydKeys(env);
  if (!keys) return { ok: false, status: 0, errorCode: "NOT_CONFIGURED", message: "Rapyd keys are not set" };

  const payload = body === undefined ? "" : JSON.stringify(body);
  const headers = signRequest(keys, method, path, payload);
  if (opts.idempotency) headers.idempotency = opts.idempotency;

  try {
    const res = await (opts.fetchImpl ?? fetch)(`${rapydBaseUrl(env)}${path}`, {
      method: method.toUpperCase(),
      headers,
      body: payload === "" ? undefined : payload,
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => null)) as RapydEnvelope<T> | null;
    if (res.ok && json?.status?.status === "SUCCESS") return { ok: true, data: json.data as T };
    return {
      ok: false,
      status: res.status,
      errorCode: json?.status?.error_code || `HTTP_${res.status}`,
      message: json?.status?.message || res.statusText || "Rapyd request failed",
    };
  } catch (err) {
    return { ok: false, status: 0, errorCode: "NETWORK", message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Whether a webhook really came from Rapyd. Rapyd signs it like a request,
 * without the method: the webhook URL as registered in the portal, then salt,
 * timestamp, access key, secret key and the raw body. The URL form has been
 * documented both with and without the scheme and host, so both are accepted;
 * either way only the holder of the secret key can produce it.
 */
export function verifyRapydWebhook(
  input: { url: string; salt: string | null; timestamp: string | null; signature: string | null; body: string },
  opts: { env?: Env; now?: number; toleranceSeconds?: number } = {}
): boolean {
  const keys = rapydKeys(opts.env ?? process.env);
  const { salt, timestamp, signature, body } = input;
  if (!keys || !salt || !timestamp || !signature) return false;

  const ts = Number(timestamp);
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  // Rapyd retries a failed delivery for hours with the original timestamp, so
  // the window is wide; the signature, not the clock, is what proves origin.
  const tolerance = opts.toleranceSeconds ?? 60 * 60 * 24;
  if (!Number.isFinite(ts) || Math.abs(now - ts) > tolerance) return false;

  let pathOnly = input.url;
  try {
    const u = new URL(input.url);
    pathOnly = u.pathname + u.search;
  } catch {
    /* already a path */
  }

  const given = Buffer.from(signature, "utf8");
  return [input.url, pathOnly].some((url) => {
    const expected = Buffer.from(
      rapydSignature([url, salt, timestamp, keys.accessKey, keys.secretKey, body], keys.secretKey),
      "utf8"
    );
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}
