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
};

export function confirmationWhatsApp(input: BookingMessageInput): string {
  const m = getMessages(input.locale).messages;
  return [
    m.hello(input.clientFullName),
    m.confirmation.lead(input.therapistFullName),
    fmtRange(input.startsAt, input.endsAt, input.timezone, input.locale),
    input.location ? m.location(input.location) : null,
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
    m.confirmation.whatsappManage(input.manageUrl),
  ]
    .filter(Boolean)
    .join("\n");
}
