import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptJson, encryptJson, hasEncryptionKey } from "@/lib/secret-box";

/**
 * The link between a Cleana+ therapist and their account at Cleana (the room
 * rental system of the same group), so a room they book there can open
 * matching slots here. See docs/cleana-link.md for the whole flow.
 *
 * Shaped like OAuth's authorization-code grant, cut down to the one client
 * there is:
 *
 *   1. Cleana sends the therapist to /connect/cleana?state=… (a page here).
 *   2. Signed in, they approve. We mint a one-time code and send the browser
 *      back to CLEANA_RETURN_URL — fixed in our environment, never taken from
 *      the request, so nobody can have a code delivered to a site of theirs.
 *   3. Cleana's server swaps the code for a long-lived access token, proving
 *      who it is with CLEANA_CLIENT_SECRET. The token never passes through a
 *      browser or a URL.
 *
 * The token belongs to one therapist and only lets Cleana open and close that
 * therapist's slots. We keep its SHA-256, never the token, so a database dump
 * hands nobody a working key. It reads `<integration id>.<secret>`: the id
 * finds the row, the secret is what is checked.
 *
 * Stored on the existing Integration row (provider "cleana"), so the add-ons
 * page shows it and disconnecting wipes it like any other add-on.
 */

const CODE_TTL_MS = 5 * 60 * 1000;
const TOKEN_PREFIX = "clp_";

type StoredSecrets = {
  /** SHA-256 (hex) of the live access token. Absent until a code is exchanged. */
  tokenHash?: string;
  /** SHA-256 (hex) of the pending one-time code, and when it stops working. */
  codeHash?: string;
  codeExpiresAt?: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function readSecrets(encrypted: string | null): StoredSecrets {
  if (!encrypted) return {};
  try {
    return decryptJson<StoredSecrets>(encrypted);
  } catch {
    // A rotated key or a damaged row: nothing in it can be trusted.
    return {};
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Splits `<id>.<secret>`; null for anything that is not shaped like one. */
function splitCredential(value: string): { id: string; secret: string } | null {
  const dot = value.indexOf(".");
  if (dot < 0) return null;
  const id = value.slice(0, dot);
  const secret = value.slice(dot + 1);
  if (!UUID.test(id) || secret.length < 32 || secret.length > 128) return null;
  return { id, secret };
}

/** Where the browser goes back to on Cleana. Fixed by configuration only. */
export function cleanaReturnUrl(): string | null {
  const raw = process.env.CLEANA_RETURN_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    // Plain http only for local development.
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Everything the link needs from the environment is there. */
export function cleanaLinkConfigured(): boolean {
  return !!cleanaReturnUrl() && !!process.env.CLEANA_CLIENT_SECRET && hasEncryptionKey();
}

/** `state` is Cleana's, echoed back untouched. Bounded so it cannot be used to stuff a URL. */
export function validState(state: unknown): state is string {
  return typeof state === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(state);
}

/**
 * Step 2: the therapist approved. Returns the one-time code to hand back to
 * Cleana. A token already issued keeps working until the code is exchanged, so
 * approving twice by mistake does not cut an existing link.
 */
export async function issueAuthorizationCode(therapistId: string): Promise<string> {
  const existing = await prisma.integration.findUnique({
    where: { therapistId_provider: { therapistId, provider: "cleana" } },
  });
  const secrets = readSecrets(existing?.credentials ?? null);

  const secret = randomBytes(32).toString("base64url");
  const next: StoredSecrets = {
    tokenHash: secrets.tokenHash,
    codeHash: sha256(secret),
    codeExpiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  };

  const row = await prisma.integration.upsert({
    where: { therapistId_provider: { therapistId, provider: "cleana" } },
    create: { therapistId, provider: "cleana", status: "disconnected", credentials: encryptJson(next) },
    update: { credentials: encryptJson(next) },
  });

  return `${row.id}.${secret}`;
}

/** Cleana's server identifies itself with the shared client secret. */
export function isCleanaClient(authorization: string | null): boolean {
  const expected = process.env.CLEANA_CLIENT_SECRET;
  if (!expected || !authorization?.startsWith("Bearer ")) return false;
  const given = authorization.slice("Bearer ".length).trim();
  return sameHash(sha256(given), sha256(expected));
}

export type ExchangeResult =
  | { ok: true; accessToken: string; accountLabel: string }
  | { ok: false; error: "invalid_grant" };

/**
 * Step 3: a valid, unexpired code becomes the access token, once. The code is
 * cleared in the same update that stores the token, guarded on the code still
 * being the one we read, so two concurrent exchanges of one code cannot both win.
 */
export async function exchangeAuthorizationCode(code: unknown): Promise<ExchangeResult> {
  if (typeof code !== "string") return { ok: false, error: "invalid_grant" };
  const parts = splitCredential(code);
  if (!parts) return { ok: false, error: "invalid_grant" };

  const row = await prisma.integration.findUnique({
    where: { id: parts.id },
    include: { therapist: { select: { email: true, status: true } } },
  });
  if (!row || row.provider !== "cleana" || row.therapist.status !== "active") {
    return { ok: false, error: "invalid_grant" };
  }

  const secrets = readSecrets(row.credentials);
  if (!secrets.codeHash || !secrets.codeExpiresAt) return { ok: false, error: "invalid_grant" };
  if (new Date(secrets.codeExpiresAt).getTime() < Date.now()) return { ok: false, error: "invalid_grant" };
  if (!sameHash(sha256(parts.secret), secrets.codeHash)) return { ok: false, error: "invalid_grant" };

  const tokenSecret = randomBytes(32).toString("base64url");
  const accessToken = `${TOKEN_PREFIX}${row.id}.${tokenSecret}`;
  const now = new Date();

  const updated = await prisma.integration.updateMany({
    // The ciphertext is fresh per write, so matching it means nobody has
    // changed the row (used the code, re-approved, disconnected) since we read it.
    where: { id: row.id, credentials: row.credentials },
    data: {
      status: "connected",
      credentials: encryptJson({ tokenHash: sha256(tokenSecret) } satisfies StoredSecrets),
      accountLabel: "Cleana",
      connectedAt: now,
      lastVerifiedAt: now,
      lastError: null,
    },
  });
  if (updated.count !== 1) return { ok: false, error: "invalid_grant" };

  return { ok: true, accessToken, accountLabel: row.therapist.email };
}

/**
 * Resolves a bearer token from Cleana to the therapist it belongs to, or null.
 * Every call Cleana makes on a therapist's behalf goes through here, and the
 * therapist comes only from the token — never from the request body.
 */
export async function therapistForCleanaToken(authorization: string | null): Promise<string | null> {
  if (!authorization?.startsWith(`Bearer ${TOKEN_PREFIX}`)) return null;
  const parts = splitCredential(authorization.slice(`Bearer ${TOKEN_PREFIX}`.length).trim());
  if (!parts) return null;

  const row = await prisma.integration.findUnique({
    where: { id: parts.id },
    include: { therapist: { select: { status: true } } },
  });
  if (!row || row.provider !== "cleana" || row.status !== "connected") return null;
  if (row.therapist.status !== "active") return null;

  const secrets = readSecrets(row.credentials);
  if (!secrets.tokenHash || !sameHash(sha256(parts.secret), secrets.tokenHash)) return null;
  return row.therapistId;
}

/** Disconnect, from either side. The token stops working at once. */
export async function disconnectCleana(therapistId: string): Promise<void> {
  await prisma.integration.updateMany({
    where: { therapistId, provider: "cleana" },
    data: {
      status: "disconnected",
      connectedAt: null,
      credentials: null,
      accountLabel: null,
      lastVerifiedAt: null,
      lastError: null,
    },
  });
}

export async function cleanaLinkStatus(
  therapistId: string
): Promise<{ connected: boolean; connectedAt: string | null }> {
  const row = await prisma.integration.findUnique({
    where: { therapistId_provider: { therapistId, provider: "cleana" } },
  });
  const connected = row?.status === "connected";
  return { connected, connectedAt: connected ? (row?.connectedAt?.toISOString() ?? null) : null };
}
