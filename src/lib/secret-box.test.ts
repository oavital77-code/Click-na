import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MissingEncryptionKeyError,
  decryptJson,
  decryptSecret,
  encryptJson,
  encryptSecret,
  hasEncryptionKey,
} from "@/lib/secret-box";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("secret-box", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("round-trips a secret", () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", KEY);
    expect(decryptSecret(encryptSecret("sk_live_abc123"))).toBe("sk_live_abc123");
  });

  it("round-trips structured credentials", () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", KEY);
    const creds = { accountSid: "AC123", authToken: "tok", fromNumber: "+972500000000" };
    expect(decryptJson(encryptJson(creds))).toEqual(creds);
  });

  it("never emits the plaintext inside the ciphertext", () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", KEY);
    expect(encryptSecret("sk_live_abc123")).not.toContain("sk_live_abc123");
  });

  // A fresh IV per call: two encryptions of the same key must not be linkable.
  it("produces different ciphertext each time for the same input", () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", KEY);
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("refuses a tampered payload instead of returning garbage", () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", KEY);
    const payload = encryptSecret("sk_live_abc123");
    const [v, iv, tag, ct] = payload.split(".");
    const flipped = Buffer.from(ct, "base64url");
    flipped[0] ^= 0xff;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64url")].join("."))).toThrow();
  });

  it("refuses a payload encrypted under a different key", () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", KEY);
    const payload = encryptSecret("sk_live_abc123");
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"));
    expect(() => decryptSecret(payload)).toThrow();
  });

  it("reports a missing key rather than falling back to plaintext", () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "");
    expect(hasEncryptionKey()).toBe(false);
    expect(() => encryptSecret("x")).toThrow(MissingEncryptionKeyError);
  });

  it("rejects a key that is the wrong length", () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", Buffer.alloc(16, 1).toString("base64"));
    expect(hasEncryptionKey()).toBe(false);
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
  });

  it("rejects a malformed payload", () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", KEY);
    expect(() => decryptSecret("not-a-payload")).toThrow(/Malformed/);
  });
});
