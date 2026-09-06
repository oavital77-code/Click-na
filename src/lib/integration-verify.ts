import type { AnyCredentials, IntegrationProvider } from "@/lib/integration-providers";
import { DEFAULT_LOCALE, getMessages, type Locale } from "@/i18n";

/**
 * "Connected" has to mean the credentials actually work. Saving whatever was
 * typed and finding out it was wrong at the moment a client books is the failure
 * mode worth spending a round-trip to avoid — so connecting calls the provider
 * once, and the add-on only flips on if that call succeeds.
 */
export type VerifyResult = { ok: true; accountLabel: string } | { ok: false; error: string };

const TIMEOUT_MS = 10_000;

function basicAuth(user: string, pass: string) {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

async function request(url: string, init: RequestInit) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

function networkError(err: unknown, locale: Locale): string {
  const m = getMessages(locale).integrations.errors;
  if (err instanceof Error && err.name === "TimeoutError") return m.timeout;
  return m.unreachable;
}

async function verifyTwilio(creds: AnyCredentials, locale: Locale): Promise<VerifyResult> {
  const m = getMessages(locale).integrations.errors;
  try {
    const res = await request(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(creds.accountSid)}.json`,
      { headers: { Authorization: basicAuth(creds.accountSid, creds.authToken) } }
    );

    if (res.status === 401) return { ok: false, error: m.twilioBadCredentials };
    if (!res.ok) return { ok: false, error: m.twilioError(res.status) };

    const body = (await res.json()) as { friendly_name?: string; status?: string };
    if (body.status && body.status !== "active") {
      return { ok: false, error: m.twilioInactive(body.status) };
    }
    return { ok: true, accountLabel: body.friendly_name || creds.accountSid };
  } catch (err) {
    return { ok: false, error: networkError(err, locale) };
  }
}

/**
 * Server-to-Server OAuth: the token is minted per call from the account
 * credentials, so there is no refresh token to store or expire.
 */
export async function zoomAccessToken(creds: AnyCredentials, locale: Locale = DEFAULT_LOCALE): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  const m = getMessages(locale).integrations.errors;
  try {
    const res = await request(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(creds.accountId)}`,
      { method: "POST", headers: { Authorization: basicAuth(creds.clientId, creds.clientSecret) } }
    );

    if (!res.ok) {
      if (res.status === 401) return { ok: false, error: m.zoomBadCredentials };
      if (res.status === 400) return { ok: false, error: m.zoomAccountMismatch };
      return { ok: false, error: m.zoomError(res.status) };
    }

    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) return { ok: false, error: m.zoomNoToken };
    return { ok: true, token: body.access_token };
  } catch (err) {
    return { ok: false, error: networkError(err, locale) };
  }
}

async function verifyZoom(creds: AnyCredentials, locale: Locale): Promise<VerifyResult> {
  const m = getMessages(locale).integrations.errors;
  const token = await zoomAccessToken(creds, locale);
  if (!token.ok) return { ok: false, error: token.error };

  try {
    const res = await request("https://api.zoom.us/v2/users/me", {
      headers: { Authorization: `Bearer ${token.token}` },
    });

    // The token minted fine but the app lacks meeting:write — connecting would
    // succeed and then every booking would fail to get a link.
    if (res.status === 403) {
      return { ok: false, error: m.zoomMissingScope };
    }
    if (!res.ok) return { ok: false, error: m.zoomError(res.status) };

    const body = (await res.json()) as { email?: string; display_name?: string };
    return { ok: true, accountLabel: body.email || body.display_name || "Zoom" };
  } catch (err) {
    return { ok: false, error: networkError(err, locale) };
  }
}

const VERIFIERS: Record<IntegrationProvider, (creds: AnyCredentials, locale: Locale) => Promise<VerifyResult>> = {
  // Nothing to verify: the feed is served by this app, from data it already has.
  calendar: async () => ({ ok: true, accountLabel: "" }),
  whatsapp: verifyTwilio,
  zoom: verifyZoom,
};

export function verifyCredentials(
  provider: IntegrationProvider,
  credentials: AnyCredentials,
  locale: Locale = DEFAULT_LOCALE
): Promise<VerifyResult> {
  return VERIFIERS[provider](credentials, locale);
}
