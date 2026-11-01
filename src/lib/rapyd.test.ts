import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { rapydBaseUrl, rapydRequest, rapydSalt, rapydSignature, signRequest, verifyRapydWebhook } from "@/lib/rapyd";

const env = { RAPYD_ACCESS_KEY: "ak_test", RAPYD_SECRET_KEY: "sk_test" };
const keys = { accessKey: "ak_test", secretKey: "sk_test" };

describe("rapyd signing", () => {
  it("base64-encodes the hex digest, as Rapyd's own samples do", () => {
    const toSign = "get/v1/data/countriesabc1234567891700000000ak_testsk_test";
    const hex = createHmac("sha256", "sk_test").update(toSign).digest("hex");
    const headers = signRequest(keys, "GET", "/v1/data/countries", "", { salt: "abc123456789", timestamp: 1700000000 });
    expect(headers.signature).toBe(Buffer.from(hex).toString("base64"));
    expect(headers).toMatchObject({ access_key: "ak_test", salt: "abc123456789", timestamp: "1700000000" });
  });

  it("makes alphanumeric salts of 12 characters", () => {
    for (let i = 0; i < 50; i++) expect(rapydSalt()).toMatch(/^[a-zA-Z0-9]{12}$/);
  });

  it("stays on the sandbox unless told otherwise", () => {
    expect(rapydBaseUrl({})).toBe("https://sandboxapi.rapyd.net");
    expect(rapydBaseUrl({ RAPYD_ENV: "production" })).toBe("https://api.rapyd.net");
  });
});

describe("rapydRequest", () => {
  it("reports missing keys without calling out", async () => {
    const fetchImpl = vi.fn();
    const r = await rapydRequest("get", "/v1/data/countries", undefined, { env: {}, fetchImpl });
    expect(r).toMatchObject({ ok: false, errorCode: "NOT_CONFIGURED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns data on SUCCESS and Rapyd's error code otherwise", async () => {
    const ok = vi.fn(async () => Response.json({ status: { status: "SUCCESS" }, data: [1, 2] }));
    expect(await rapydRequest("get", "/v1/data/countries", undefined, { env, fetchImpl: ok })).toEqual({ ok: true, data: [1, 2] });
    const [url, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://sandboxapi.rapyd.net/v1/data/countries");
    expect(init.body).toBeUndefined();

    const bad = vi.fn(async () =>
      Response.json({ status: { status: "ERROR", error_code: "UNAUTHENTICATED_API_CALL", message: "x" } }, { status: 401 })
    );
    expect(await rapydRequest("get", "/v1/x", undefined, { env, fetchImpl: bad })).toMatchObject({
      ok: false,
      errorCode: "UNAUTHENTICATED_API_CALL",
    });
  });
});

describe("verifyRapydWebhook", () => {
  const url = "https://cleanaplus.cleanagroup.app/api/webhooks/rapyd";
  const body = '{"id":"wh_1","type":"PAYMENT_COMPLETED"}';
  const sign = (u: string) => rapydSignature([u, "salt12345678", "1700000000", "ak_test", "sk_test", body], "sk_test");

  it("accepts the full URL or the path, and nothing tampered", () => {
    const base = { url, salt: "salt12345678", timestamp: "1700000000", body };
    const opts = { env, now: 1700000100 };
    expect(verifyRapydWebhook({ ...base, signature: sign(url) }, opts)).toBe(true);
    expect(verifyRapydWebhook({ ...base, signature: sign("/api/webhooks/rapyd") }, opts)).toBe(true);
    expect(verifyRapydWebhook({ ...base, body: body + " ", signature: sign(url) }, opts)).toBe(false);
    expect(verifyRapydWebhook({ ...base, signature: null }, opts)).toBe(false);
    expect(verifyRapydWebhook({ ...base, signature: sign(url) }, { env, now: 1700000000 + 3 * 86400 })).toBe(false);
    expect(verifyRapydWebhook({ ...base, signature: sign(url) }, { env: {}, now: 1700000100 })).toBe(false);
  });
});
