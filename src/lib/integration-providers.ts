import { z } from "zod";
import { getMessages, type Locale } from "@/i18n";

export const INTEGRATION_PROVIDERS = ["calendar", "zoom", "whatsapp", "payplus", "paymentLink"] as const;

/** The add-ons through which a client pays a therapist. At most one is used per booking. */
export const PAYMENT_PROVIDERS = ["payplus", "paymentLink"] as const satisfies readonly IntegrationProvider[];
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];
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
  /**
   * Walk the therapist through the fields one at a time, each with its own
   * hint, instead of one form of empty boxes. For the add-ons a non-technical
   * person is most likely to give up on.
   */
  guided?: boolean;
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
    payplus: {
      provider: "payplus",
      label: m.payplus.label,
      summary: m.payplus.summary,
      // The same three values the platform's own billing uses. PayPlus sends
      // its callback to whatever URL each payment page is created with, so
      // there is no fourth step of registering our address on their side.
      fields: [
        { name: "apiKey", label: m.payplus.fields.apiKey, secret: true, help: m.payplus.help.apiKey },
        { name: "secretKey", label: m.payplus.fields.secretKey, secret: true, help: m.payplus.help.secretKey },
        { name: "paymentPageUid", label: m.payplus.fields.paymentPageUid, secret: false, help: m.payplus.help.paymentPageUid },
      ],
      // PayPlus's merchant site; the API-keys screen is under its settings.
      // A deeper link is not documented publicly, so this stays the landing.
      docsUrl: "https://www.payplus.co.il",
      setupHint: m.payplus.setupHint,
      note: m.payplus.note,
      guided: true,
    },
    paymentLink: {
      provider: "paymentLink",
      label: m.paymentLink.label,
      summary: m.paymentLink.summary,
      fields: [
        { name: "url", label: m.paymentLink.fields.url, secret: false, placeholder: "https://", help: m.paymentLink.help.url },
      ],
      docsUrl: null,
      setupHint: m.paymentLink.setupHint,
      note: m.paymentLink.note,
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
  payplus: z.object({
    apiKey: z.string().trim().min(1, "validation.required"),
    secretKey: z.string().trim().min(1, "validation.required"),
    paymentPageUid: z.string().trim().min(1, "validation.required"),
  }),
  // The link is rendered as an href on a page clients open, so the scheme is
  // pinned: `.url()` alone accepts javascript: and data:.
  paymentLink: z.object({
    url: z
      .string()
      .trim()
      .url("validation.urlInvalid")
      .max(500)
      .refine((value) => /^https:\/\//i.test(value), "validation.urlScheme"),
  }),
} satisfies Record<IntegrationProvider, z.ZodType>;

export type CredentialsFor<P extends IntegrationProvider> = z.infer<(typeof CREDENTIAL_SCHEMAS)[P]>;
export type AnyCredentials = Record<string, string>;
