import { z } from "zod";

export const INTEGRATION_PROVIDERS = ["calendar", "zoom", "whatsapp"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export type CredentialField = {
  name: string;
  label: string;
  /** Rendered masked, and never echoed back to the browser once saved. */
  secret: boolean;
  placeholder?: string;
  help?: string;
};

export type ProviderSpec = {
  provider: IntegrationProvider;
  label: string;
  summary: string;
  /** What the therapist has to paste in. Empty means the add-on needs no account. */
  fields: readonly CredentialField[];
  /** Where those values live in the provider's own dashboard. */
  docsUrl: string | null;
  setupHint: string;
  /** Anything the therapist should know that the summary would overstate. */
  note?: string;
};

export const PROVIDER_SPECS: Record<IntegrationProvider, ProviderSpec> = {
  calendar: {
    provider: "calendar",
    label: "סנכרון יומן",
    summary:
      "כתובת מנוי ליומן שמושכת אליה את כל התורים שנקבעו. עובדת מול Google Calendar, יומן האייפון ו-Outlook.",
    fields: [],
    docsUrl: null,
    setupHint: "לא נדרש חשבון חיצוני — אפשר להפעיל מיד.",
  },
  zoom: {
    provider: "zoom",
    label: "Zoom",
    summary: "פתיחת פגישת Zoom אוטומטית לכל תור מקוון, והקישור נשלח ללקוח יחד עם האישור.",
    fields: [
      { name: "accountId", label: "Account ID", secret: false },
      { name: "clientId", label: "Client ID", secret: false },
      { name: "clientSecret", label: "Client Secret", secret: true },
    ],
    docsUrl: "https://marketplace.zoom.us/develop/create",
    setupHint:
      'ב-Zoom Marketplace: Develop ← Build App ← "Server-to-Server OAuth". בהרשאות (Scopes) צריך meeting:write:admin. שלושת הערכים מופיעים בלשונית App Credentials.',
  },
  whatsapp: {
    provider: "whatsapp",
    label: "WhatsApp",
    summary: "שליחת אישורים ותזכורות בוואטסאפ במקום (או בנוסף) למייל.",
    fields: [
      { name: "accountSid", label: "Account SID", secret: false, placeholder: "AC..." },
      { name: "authToken", label: "Auth Token", secret: true },
      {
        name: "fromNumber",
        label: "מספר השולח",
        secret: false,
        placeholder: "+14155238886",
        help: "המספר שאושר לוואטסאפ ב-Twilio. בסנדבוקס זה המספר שטוויליו נותנת לבדיקות.",
      },
    ],
    docsUrl: "https://console.twilio.com",
    setupHint:
      "דרך Twilio: שלושת הערכים נמצאים בעמוד הראשי של הקונסולה ובמסך WhatsApp Senders. הסנדבוקס עובד מיד; מספר עסקי אמיתי דורש אימות עסק אצל Meta.",
  },
};

/**
 * Per-provider validation of what the therapist typed. Deliberately loose on
 * format — Twilio and Stripe are the authority on whether a credential is real,
 * and we find that out by calling them, not by pattern-matching a prefix that
 * they are free to change.
 */
export const CREDENTIAL_SCHEMAS = {
  calendar: z.object({}),
  zoom: z.object({
    accountId: z.string().trim().min(1, "שדה חובה"),
    clientId: z.string().trim().min(1, "שדה חובה"),
    clientSecret: z.string().trim().min(1, "שדה חובה"),
  }),
  whatsapp: z.object({
    accountSid: z.string().trim().min(1, "שדה חובה"),
    authToken: z.string().trim().min(1, "שדה חובה"),
    fromNumber: z.string().trim().min(1, "שדה חובה"),
  }),
} satisfies Record<IntegrationProvider, z.ZodType>;

export type CredentialsFor<P extends IntegrationProvider> = z.infer<(typeof CREDENTIAL_SCHEMAS)[P]>;
export type AnyCredentials = Record<string, string>;
