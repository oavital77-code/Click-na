import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/public-url";
import { decryptJson, encryptJson, hasEncryptionKey } from "@/lib/secret-box";
import { verifyCredentials } from "@/lib/integration-verify";
import {
  CREDENTIAL_SCHEMAS,
  INTEGRATION_PROVIDERS,
  PROVIDER_SPECS,
  type AnyCredentials,
  type IntegrationProvider,
  type ProviderSpec,
} from "@/lib/integration-providers";

export { INTEGRATION_PROVIDERS, PROVIDER_SPECS };
export type { CredentialField, IntegrationProvider, ProviderSpec } from "@/lib/integration-providers";

export type IntegrationState = "connected" | "disconnected";

export type IntegrationCard = ProviderSpec & {
  state: IntegrationState;
  /** Which credential fields already hold a value. Never the values themselves. */
  filledFields: string[];
  accountLabel: string | null;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  /** Only ever set for a connected calendar add-on. */
  feedUrl: string | null;
};

export function calendarFeedUrl(feedToken: string): string {
  return `${appUrl()}/api/calendar/${feedToken}`;
}

/**
 * Credentials are stored encrypted, so without a key there is nowhere safe to put
 * them. Reported once for the whole page rather than per card: it is a deployment
 * problem, not something wrong with any particular provider.
 */
export function credentialStorageReady(): boolean {
  return hasEncryptionKey();
}

function readFilledFields(spec: ProviderSpec, encrypted: string | null): string[] {
  if (!encrypted) return [];
  try {
    const creds = decryptJson<AnyCredentials>(encrypted);
    return spec.fields.filter((field) => !!creds[field.name]).map((field) => field.name);
  } catch {
    // A key rotation (or a corrupted row) leaves credentials we can't read. Say
    // nothing is filled in, so the therapist is prompted to re-enter rather than
    // shown a connected add-on that can never work.
    return [];
  }
}

export async function listIntegrations(therapistId: string): Promise<IntegrationCard[]> {
  const rows = await prisma.integration.findMany({ where: { therapistId } });
  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  return INTEGRATION_PROVIDERS.map((provider) => {
    const spec = PROVIDER_SPECS[provider];
    const row = byProvider.get(provider);
    const state: IntegrationState = row?.status === "connected" ? "connected" : "disconnected";

    return {
      ...spec,
      state,
      filledFields: readFilledFields(spec, row?.credentials ?? null),
      accountLabel: row?.accountLabel ?? null,
      connectedAt: row?.connectedAt?.toISOString() ?? null,
      lastVerifiedAt: row?.lastVerifiedAt?.toISOString() ?? null,
      lastError: row?.lastError ?? null,
      feedUrl:
        provider === "calendar" && state === "connected" && row?.feedToken
          ? calendarFeedUrl(row.feedToken)
          : null,
    };
  });
}

/**
 * Decrypted credentials for server-side use (sending a WhatsApp message, opening
 * a Zoom meeting). Returns null unless the add-on is actually connected, so a
 * caller can't act on credentials the therapist has switched off.
 */
export async function getCredentials(
  therapistId: string,
  provider: IntegrationProvider
): Promise<AnyCredentials | null> {
  const row = await prisma.integration.findUnique({
    where: { therapistId_provider: { therapistId, provider } },
  });
  if (!row || row.status !== "connected" || !row.credentials) return null;

  try {
    return decryptJson<AnyCredentials>(row.credentials);
  } catch {
    return null;
  }
}

export type ConnectResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function connectIntegration(
  therapistId: string,
  provider: IntegrationProvider,
  input: unknown
): Promise<ConnectResult> {
  const spec = PROVIDER_SPECS[provider];

  const parsed = CREDENTIAL_SCHEMAS[provider].safeParse(input ?? {});
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "יש להשלים את כל השדות.", fieldErrors };
  }

  const credentials = parsed.data as AnyCredentials;

  if (spec.fields.length > 0 && !credentialStorageReady()) {
    return {
      ok: false,
      error: "אחסון מוצפן לא מוגדר בשרת, ולכן אי אפשר לשמור פרטי חשבון. צריך להגדיר INTEGRATION_ENCRYPTION_KEY.",
    };
  }

  const verified = await verifyCredentials(provider, credentials);
  if (!verified.ok) {
    await prisma.integration.upsert({
      where: { therapistId_provider: { therapistId, provider } },
      create: { therapistId, provider, status: "disconnected", lastError: verified.error },
      update: { status: "disconnected", connectedAt: null, lastError: verified.error },
    });
    return { ok: false, error: verified.error };
  }

  const existing = await prisma.integration.findUnique({
    where: { therapistId_provider: { therapistId, provider } },
  });

  // Re-connecting keeps the original feed token, so a calendar the therapist
  // already subscribed to on their phone doesn't silently stop updating.
  const feedToken =
    provider === "calendar" ? (existing?.feedToken ?? randomBytes(24).toString("hex")) : null;

  const data = {
    status: "connected" as const,
    connectedAt: new Date(),
    lastVerifiedAt: new Date(),
    lastError: null,
    accountLabel: verified.accountLabel || null,
    credentials: spec.fields.length > 0 ? encryptJson(credentials) : null,
    feedToken,
  };

  await prisma.integration.upsert({
    where: { therapistId_provider: { therapistId, provider } },
    create: { therapistId, provider, ...data },
    update: data,
  });

  return { ok: true };
}

export async function disconnectIntegration(therapistId: string, provider: IntegrationProvider) {
  const existing = await prisma.integration.findUnique({
    where: { therapistId_provider: { therapistId, provider } },
  });
  if (!existing) return null;

  // Credentials are wiped on disconnect rather than parked: holding someone's
  // live Stripe key for an add-on they turned off is not ours to do. The feed
  // token stays, so a calendar already subscribed on their phone keeps resolving
  // (to an empty calendar) and re-connecting revives the same URL.
  return prisma.integration.update({
    where: { id: existing.id },
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

/** Records a failure that happened while *using* an add-on, not while connecting. */
export async function recordIntegrationFailure(
  therapistId: string,
  provider: IntegrationProvider,
  error: string
) {
  await prisma.integration.updateMany({
    where: { therapistId, provider },
    data: { lastError: error },
  });
}
