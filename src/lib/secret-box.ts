import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Symmetric encryption for third-party credentials a therapist hands us — their
 * Stripe secret key, their Twilio auth token, their Zoom client secret.
 *
 * These are not our secrets to lose. A plaintext column means a single leaked
 * database dump (a mis-scoped Supabase policy, a stray backup) hands an attacker
 * live billing and messaging credentials for every therapist at once, and there
 * is nothing they can rotate centrally. Encrypting at rest moves the blast radius
 * to a key that lives only in the environment.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than silently yielding garbage that we'd then send to Stripe.
 */

const KEY_ENV = "INTEGRATION_ENCRYPTION_KEY";
const VERSION = "v1";
const IV_BYTES = 12; // 96 bits — the size GCM is defined for
const KEY_BYTES = 32;

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super(`${KEY_ENV} is not configured`);
    this.name = "MissingEncryptionKeyError";
  }
}

function key(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) throw new MissingEncryptionKeyError();

  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== KEY_BYTES) {
    // A short key would still "work" — Node pads or throws late — so check here
    // rather than discovering it at the first decrypt of real data.
    throw new Error(`${KEY_ENV} must be ${KEY_BYTES} bytes, base64-encoded`);
  }
  return decoded;
}

export function hasEncryptionKey(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/** Encodes as `v1.<iv>.<authTag>.<ciphertext>`, all base64url. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string): string {
  const [version, iv, authTag, ciphertext] = payload.split(".");
  if (version !== VERSION || !iv || !authTag || !ciphertext) {
    throw new Error("Malformed encrypted payload");
  }

  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptJson(value: unknown): string {
  return encryptSecret(JSON.stringify(value));
}

export function decryptJson<T>(payload: string): T {
  return JSON.parse(decryptSecret(payload)) as T;
}
