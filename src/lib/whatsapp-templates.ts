import { formatInTimeZone } from "date-fns-tz";
import { he } from "date-fns/locale";

/** Same wording as the emails, trimmed for a chat bubble: no salutation block, no footer. */
function when(startsAt: Date, endsAt: Date, timezone: string) {
  const day = formatInTimeZone(startsAt, timezone, "EEEE, d.M.yyyy", { locale: he });
  return `${day}, ${formatInTimeZone(startsAt, timezone, "HH:mm")}–${formatInTimeZone(endsAt, timezone, "HH:mm")}`;
}

export type BookingMessageInput = {
  clientFullName: string;
  therapistFullName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  location: string | null;
  manageUrl: string;
};

export function confirmationWhatsApp(input: BookingMessageInput): string {
  return [
    `שלום ${input.clientFullName},`,
    `התור שלך אצל ${input.therapistFullName} אושר:`,
    when(input.startsAt, input.endsAt, input.timezone),
    input.location ? `מיקום: ${input.location}` : null,
    `לצפייה או לביטול: ${input.manageUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function reminderWhatsApp(input: BookingMessageInput): string {
  return [
    `שלום ${input.clientFullName},`,
    `תזכורת לתור אצל ${input.therapistFullName}:`,
    when(input.startsAt, input.endsAt, input.timezone),
    input.location ? `מיקום: ${input.location}` : null,
    `לצפייה או לביטול: ${input.manageUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
}
