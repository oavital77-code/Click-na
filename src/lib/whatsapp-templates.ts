import { getMessages, type Locale } from "@/i18n";
import { fmtRange } from "@/i18n/dates";

/** Same wording as the emails, trimmed for a chat bubble: no salutation block, no footer. */
export type BookingMessageInput = {
  locale: Locale;
  clientFullName: string;
  therapistFullName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  location: string | null;
  manageUrl: string;
  /** Where to pay, when the therapist takes payment online and this one is unpaid. */
  paymentUrl?: string | null;
  /** Already formatted for the locale, or null when the page decides the amount. */
  paymentAmount?: string | null;
};

function paymentLine(input: BookingMessageInput): string | null {
  if (!input.paymentUrl) return null;
  return getMessages(input.locale).messages.payment.whatsapp(input.paymentUrl, input.paymentAmount ?? null);
}

export function confirmationWhatsApp(input: BookingMessageInput): string {
  const m = getMessages(input.locale).messages;
  return [
    m.hello(input.clientFullName),
    m.confirmation.lead(input.therapistFullName),
    fmtRange(input.startsAt, input.endsAt, input.timezone, input.locale),
    input.location ? m.location(input.location) : null,
    paymentLine(input),
    m.confirmation.whatsappManage(input.manageUrl),
  ]
    .filter(Boolean)
    .join("\n");
}

export function reminderWhatsApp(input: BookingMessageInput): string {
  const m = getMessages(input.locale).messages;
  return [
    m.hello(input.clientFullName),
    m.reminder.whatsappLead(input.therapistFullName),
    fmtRange(input.startsAt, input.endsAt, input.timezone, input.locale),
    input.location ? m.location(input.location) : null,
    paymentLine(input),
    m.confirmation.whatsappManage(input.manageUrl),
  ]
    .filter(Boolean)
    .join("\n");
}
