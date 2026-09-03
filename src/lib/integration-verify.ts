import type { AnyCredentials, IntegrationProvider } from "@/lib/integration-providers";

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

function networkError(err: unknown): string {
  if (err instanceof Error && err.name === "TimeoutError") return "השירות לא הגיב בזמן. נסה שוב.";
  return "לא הצלחנו להגיע לשירות. בדוק את החיבור ונסה שוב.";
}

async function verifyTwilio(creds: AnyCredentials): Promise<VerifyResult> {
  try {
    const res = await request(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(creds.accountSid)}.json`,
      { headers: { Authorization: basicAuth(creds.accountSid, creds.authToken) } }
    );

    if (res.status === 401) return { ok: false, error: "ה-Account SID או ה-Auth Token שגויים." };
    if (!res.ok) return { ok: false, error: `Twilio החזירה שגיאה (${res.status}).` };

    const body = (await res.json()) as { friendly_name?: string; status?: string };
    if (body.status && body.status !== "active") {
      return { ok: false, error: `חשבון ה-Twilio אינו פעיל (${body.status}).` };
    }
    return { ok: true, accountLabel: body.friendly_name || creds.accountSid };
  } catch (err) {
    return { ok: false, error: networkError(err) };
  }
}

async function verifyStripe(creds: AnyCredentials): Promise<VerifyResult> {
  try {
    const res = await request("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${creds.secretKey}` },
    });

    if (res.status === 401) return { ok: false, error: "המפתח הסודי שגוי או בוטל." };
    if (!res.ok) return { ok: false, error: `Stripe החזירה שגיאה (${res.status}).` };

    const body = (await res.json()) as {
      id?: string;
      email?: string;
      charges_enabled?: boolean;
      business_profile?: { name?: string | null };
    };

    // A key can be perfectly valid on an account that Stripe hasn't cleared for
    // charges yet. Connecting it would look fine and then fail on the first
    // booking, so it counts as not connected.
    if (body.charges_enabled === false) {
      return { ok: false, error: "חשבון ה-Stripe עדיין לא אושר לגבייה. השלם את ההרשמה ב-Stripe." };
    }
    return { ok: true, accountLabel: body.business_profile?.name || body.email || body.id || "Stripe" };
  } catch (err) {
    return { ok: false, error: networkError(err) };
  }
}

/**
 * Server-to-Server OAuth: the token is minted per call from the account
 * credentials, so there is no refresh token to store or expire.
 */
export async function zoomAccessToken(creds: AnyCredentials): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  try {
    const res = await request(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(creds.accountId)}`,
      { method: "POST", headers: { Authorization: basicAuth(creds.clientId, creds.clientSecret) } }
    );

    if (!res.ok) {
      if (res.status === 401) return { ok: false, error: "ה-Client ID או ה-Client Secret שגויים." };
      if (res.status === 400) return { ok: false, error: "ה-Account ID אינו תואם לאפליקציה הזו." };
      return { ok: false, error: `Zoom החזירה שגיאה (${res.status}).` };
    }

    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) return { ok: false, error: "Zoom לא החזירה טוקן." };
    return { ok: true, token: body.access_token };
  } catch (err) {
    return { ok: false, error: networkError(err) };
  }
}

async function verifyZoom(creds: AnyCredentials): Promise<VerifyResult> {
  const token = await zoomAccessToken(creds);
  if (!token.ok) return { ok: false, error: token.error };

  try {
    const res = await request("https://api.zoom.us/v2/users/me", {
      headers: { Authorization: `Bearer ${token.token}` },
    });

    // The token minted fine but the app lacks meeting:write — connecting would
    // succeed and then every booking would fail to get a link.
    if (res.status === 403) {
      return { ok: false, error: "לאפליקציה חסרה ההרשאה meeting:write:admin ב-Zoom." };
    }
    if (!res.ok) return { ok: false, error: `Zoom החזירה שגיאה (${res.status}).` };

    const body = (await res.json()) as { email?: string; display_name?: string };
    return { ok: true, accountLabel: body.email || body.display_name || "Zoom" };
  } catch (err) {
    return { ok: false, error: networkError(err) };
  }
}

const VERIFIERS: Record<IntegrationProvider, (creds: AnyCredentials) => Promise<VerifyResult>> = {
  // Nothing to verify: the feed is served by this app, from data it already has.
  calendar: async () => ({ ok: true, accountLabel: "" }),
  whatsapp: verifyTwilio,
  payments: verifyStripe,
  zoom: verifyZoom,
};

export function verifyCredentials(
  provider: IntegrationProvider,
  credentials: AnyCredentials
): Promise<VerifyResult> {
  return VERIFIERS[provider](credentials);
}
