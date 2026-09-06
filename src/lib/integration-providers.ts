import { z } from "zod";
import { getMessages, type Locale } from "@/i18n";

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

/**
 * The shape of each add-on — which fields it needs and where they come from —
 * is fixed; only the words change with the therapist's language, so the specs
 * are built per locale from the message catalogue.
 */
export function getProviderSpecs(locale: Locale): Record<IntegrationProvider, ProviderSpec> {
  const m = getMessages(locale).integrations;
  return {
    calendar: {
      provider: "calendar",
      label: m.calendar.label,
      summary: m.calendar.summary,
      fields: [],
      docsUrl: null,
      setupHint: m.calendar.setupHint,
    },
    zoom: {
      provider: "zoom",
      label: m.zoom.label,
      summary: m.zoom.summary,
      fields: [
        { name: "accountId", label: m.zoom.fields.accountId, secret: false },
        { name: "clientId", label: m.zoom.fields.clientId, secret: false },
        { name: "clientSecret", label: m.zoom.fields.clientSecret, secret: true },
      ],
      docsUrl: "https://marketplace.zoom.us/develop/create",
      setupHint: m.zoom.setupHint,
    },
    whatsapp: {
      provider: "whatsapp",
      label: m.whatsapp.label,
      summary: m.whatsapp.summary,
      fields: [
        { name: "accountSid", label: m.whatsapp.fields.accountSid, secret: false, placeholder: "AC..." },
        { name: "authToken", label: m.whatsapp.fields.authToken, secret: true },
        {
          name: "fromNumber",
          label: m.whatsapp.fields.fromNumber,
          secret: false,
          placeholder: "+14155238886",
          help: m.whatsapp.fromNumberHelp,
        },
      ],
      docsUrl: "https://console.twilio.com",
      setupHint: m.whatsapp.setupHint,
    },
  };
}

/**
 * Per-provider validation of what the therapist typed. Deliberately loose on
 * format — Twilio and Zoom are the authority on whether a credential is real,
 * and we find that out by calling them, not by pattern-matching a prefix that
 * they are free to change. Messages are catalogue keys, translated on display.
 */
export const CREDENTIAL_SCHEMAS = {
  calendar: z.object({}),
  zoom: z.object({
    accountId: z.string().trim().min(1, "validation.required"),
    clientId: z.string().trim().min(1, "validation.required"),
    clientSecret: z.string().trim().min(1, "validation.required"),
  }),
  whatsapp: z.object({
    accountSid: z.string().trim().min(1, "validation.required"),
    authToken: z.string().trim().min(1, "validation.required"),
    fromNumber: z.string().trim().min(1, "validation.required"),
  }),
} satisfies Record<IntegrationProvider, z.ZodType>;

export type CredentialsFor<P extends IntegrationProvider> = z.infer<(typeof CREDENTIAL_SCHEMAS)[P]>;
export type AnyCredentials = Record<string, string>;
