import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/public-url";

export const INTEGRATION_PROVIDERS = ["calendar", "zoom", "payments", "whatsapp"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

/**
 * `unavailable` is not a stored state — it is derived per request from whether
 * this deployment carries the provider's server credentials. A therapist can
 * only ever be `connected` or `disconnected`; if the keys are pulled out of the
 * environment, an already-connected add-on reads back as unavailable without
 * anyone having to migrate the table.
 */
export type IntegrationState = "unavailable" | "disconnected" | "connected";

export type ProviderSpec = {
  provider: IntegrationProvider;
  label: string;
  summary: string;
  /**
   * Server-wide environment variables the provider needs before anyone can
   * connect. Empty means the add-on works with nothing but this codebase.
   */
  requiredEnv: readonly string[];
  /** What the account owner has to go and obtain, in plain Hebrew. */
  setupHint: string;
};

export const PROVIDER_SPECS: Record<IntegrationProvider, ProviderSpec> = {
  calendar: {
    provider: "calendar",
    label: "סנכרון יומן",
    summary:
      "כתובת מנוי ליומן שמושכת אליה את כל התורים שנקבעו. עובדת מול Google Calendar, יומן האייפון ו-Outlook.",
    requiredEnv: [],
    setupHint: "לא נדרש שום חשבון חיצוני — אפשר לחבר עכשיו.",
  },
  zoom: {
    provider: "zoom",
    label: "Zoom",
    summary: "פתיחת פגישת Zoom אוטומטית לכל תור מקוון, והקישור נשלח ללקוח יחד עם האישור.",
    requiredEnv: ["ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET"],
    setupHint: "אפליקציית OAuth ב-Zoom Marketplace — נותנת Client ID ו-Client Secret. פתיחה מיידית.",
  },
  payments: {
    provider: "payments",
    label: "תשלומים",
    summary: "גבייה מהלקוח בעת קביעת התור, ישירות לחשבון שלך.",
    requiredEnv: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    setupHint: "חשבון Stripe עם Connect — נותן מפתח סודי וסוד ל-webhook. אישור לוקח שעות עד יום.",
  },
  whatsapp: {
    provider: "whatsapp",
    label: "WhatsApp",
    summary: "שליחת אישורים ותזכורות בוואטסאפ במקום (או בנוסף) למייל.",
    requiredEnv: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
    setupHint:
      "חשבון WhatsApp Business API (Meta או Twilio) + אימות עסק + אישור תבניות הודעה. זה הארוך ביותר — ימים.",
  },
};

/** Environment variables the provider needs that this deployment doesn't have. */
export function missingEnv(provider: IntegrationProvider): string[] {
  return PROVIDER_SPECS[provider].requiredEnv.filter((name) => !process.env[name]);
}

export function isProviderAvailable(provider: IntegrationProvider): boolean {
  return missingEnv(provider).length === 0;
}

/** Public subscription URL for the calendar feed. */
export function calendarFeedUrl(feedToken: string): string {
  return `${appUrl()}/api/calendar/${feedToken}`;
}

export type IntegrationCard = ProviderSpec & {
  state: IntegrationState;
  missingEnv: string[];
  connectedAt: string | null;
  /** Only ever set for a connected calendar add-on. */
  feedUrl: string | null;
};

export async function listIntegrations(therapistId: string): Promise<IntegrationCard[]> {
  const rows = await prisma.integration.findMany({ where: { therapistId } });
  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  return INTEGRATION_PROVIDERS.map((provider) => {
    const spec = PROVIDER_SPECS[provider];
    const row = byProvider.get(provider);
    const missing = missingEnv(provider);
    const state: IntegrationState =
      missing.length > 0 ? "unavailable" : row?.status === "connected" ? "connected" : "disconnected";

    return {
      ...spec,
      state,
      missingEnv: missing,
      connectedAt: state === "connected" ? (row?.connectedAt?.toISOString() ?? null) : null,
      feedUrl:
        provider === "calendar" && state === "connected" && row?.feedToken
          ? calendarFeedUrl(row.feedToken)
          : null,
    };
  });
}

export class ProviderUnavailableError extends Error {
  constructor(public readonly provider: IntegrationProvider) {
    super(`Integration provider "${provider}" is not configured on this deployment`);
    this.name = "ProviderUnavailableError";
  }
}

export async function connectIntegration(therapistId: string, provider: IntegrationProvider) {
  if (!isProviderAvailable(provider)) throw new ProviderUnavailableError(provider);

  const existing = await prisma.integration.findUnique({
    where: { therapistId_provider: { therapistId, provider } },
  });

  // Re-connecting keeps the original feed token, so a calendar the therapist
  // already subscribed to on their phone doesn't silently stop updating.
  const feedToken =
    provider === "calendar" ? (existing?.feedToken ?? randomBytes(24).toString("hex")) : null;

  return prisma.integration.upsert({
    where: { therapistId_provider: { therapistId, provider } },
    create: { therapistId, provider, status: "connected", connectedAt: new Date(), feedToken },
    update: { status: "connected", connectedAt: new Date(), feedToken },
  });
}

export async function disconnectIntegration(therapistId: string, provider: IntegrationProvider) {
  const existing = await prisma.integration.findUnique({
    where: { therapistId_provider: { therapistId, provider } },
  });
  if (!existing) return null;

  // The feed token is deliberately kept rather than nulled: anyone holding the
  // old URL gets an empty calendar (the route checks status), and re-connecting
  // revives the same subscription instead of orphaning it.
  return prisma.integration.update({
    where: { id: existing.id },
    data: { status: "disconnected", connectedAt: null },
  });
}
