import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyCredentials, zoomAccessToken } from "@/lib/integration-verify";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const TWILIO = { accountSid: "AC123", authToken: "tok", fromNumber: "+14155238886" };
const ZOOM = { accountId: "acc", clientId: "cid", clientSecret: "secret" };

describe("verifyCredentials — Twilio", () => {
  it("accepts an active account and names it", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { friendly_name: "Or's Clinic", status: "active" }));
    expect(await verifyCredentials("whatsapp", TWILIO)).toEqual({
      ok: true,
      accountLabel: "Or's Clinic",
    });
  });

  it("sends the SID and token as HTTP basic auth", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { friendly_name: "x", status: "active" }));
    await verifyCredentials("whatsapp", TWILIO);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/Accounts/AC123.json");
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from("AC123:tok").toString("base64")}`
    );
  });

  it("turns a 401 into an explanation, not a generic failure", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, {}));
    const result = await verifyCredentials("whatsapp", TWILIO);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Auth Token");
  });

  // Suspended accounts authenticate fine and then refuse to send anything.
  it("rejects an account that is not active", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { friendly_name: "x", status: "suspended" }));
    const result = await verifyCredentials("whatsapp", TWILIO);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("suspended");
  });
});

describe("verifyCredentials — Zoom", () => {
  it("mints a token and then identifies the account", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "zoom-token" }))
      .mockResolvedValueOnce(jsonResponse(200, { email: "or@example.com" }));

    expect(await verifyCredentials("zoom", ZOOM)).toEqual({
      ok: true,
      accountLabel: "or@example.com",
    });
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer zoom-token");
  });

  it("distinguishes wrong client credentials from a wrong account id", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, {}));
    const unauthorized = await zoomAccessToken(ZOOM);
    expect(unauthorized.ok).toBe(false);
    if (!unauthorized.ok) expect(unauthorized.error).toContain("Client Secret");

    fetchMock.mockResolvedValue(jsonResponse(400, {}));
    const badAccount = await zoomAccessToken(ZOOM);
    expect(badAccount.ok).toBe(false);
    if (!badAccount.ok) expect(badAccount.error).toContain("Account ID");
  });

  // The token mints fine but the app has no meeting scope — connecting would
  // succeed and every booking would then fail to get a link.
  it("rejects an app that lacks the meeting scope", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "zoom-token" }))
      .mockResolvedValueOnce(jsonResponse(403, {}));

    const result = await verifyCredentials("zoom", ZOOM);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("meeting:write:admin");
  });
});

describe("verifyCredentials — failure handling", () => {
  it("reports a timeout as a timeout rather than bad credentials", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    fetchMock.mockRejectedValue(timeout);

    const result = await verifyCredentials("whatsapp", TWILIO);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("did not respond in time");
  });

  it("survives a network error instead of throwing into the request handler", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(verifyCredentials("whatsapp", TWILIO)).resolves.toMatchObject({ ok: false });
  });

  it("treats the calendar as needing no verification at all", async () => {
    expect(await verifyCredentials("calendar", {})).toEqual({ ok: true, accountLabel: "" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
