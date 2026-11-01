import { formatInTimeZone } from "date-fns-tz";
import { getMessages, type Locale, dateFnsLocale, DATE_PATTERNS } from "@/i18n";
import { fmtRange } from "@/i18n/dates";

/**
 * HTML-escapes a string before it is interpolated into a template.
 *
 * Every name, address and label below comes from a form somebody typed into —
 * a client's name from the public booking page, a therapist's own name and
 * location from their settings. Interpolated raw, `<a href="https://…">` typed
 * as a name arrives in the therapist's inbox as a live link. Mail clients strip
 * scripts, but phishing needs no script — a link and a plausible sentence do.
 * The same escaping is correct inside attribute values, so URLs go through it
 * too even though the app builds them itself.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "6.9.2026" / "6 Sept 2026" — the short date a cancellation names. */
function day(date: Date, timezone: string, locale: Locale) {
  return formatInTimeZone(date, timezone, DATE_PATTERNS[locale].date, { locale: dateFnsLocale(locale) });
}

function dateTime(date: Date, timezone: string, locale: Locale) {
  return formatInTimeZone(date, timezone, DATE_PATTERNS[locale].dateTime, { locale: dateFnsLocale(locale) });
}

/**
 * Every email is written in the therapist's language — the client is their
 * client, and the practice speaks one language to everyone. `lang` and `dir`
 * follow, so a mail client lays the Hebrew out right-to-left and the English
 * left-to-right.
 */
function wrap(locale: Locale, bodyHtml: string) {
  const m = getMessages(locale);
  const dir = locale === "he" ? "rtl" : "ltr";
  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
  <body style="margin:0;padding:24px;background:#f6f5f3;font-family:Arial,Helvetica,sans-serif;color:#1f1f1f;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      ${bodyHtml}
      <!-- dir="ltr" on the wordmark: the name and the plus are separate runs, so
           an RTL paragraph reorders them and the footer reads "+Cleana". -->
      <p style="margin-top:32px;font-size:12px;color:#8a8a8a;">${m.messages.footer} <span dir="ltr">Cleana+</span></p>
    </div>
  </body>
</html>`;
}

type Localized = { locale: Locale };

export type PaymentRequestEmailInput = Localized & {
  clientFullName: string;
  therapistFullName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  /** The treatment the sum is for, when it came from the menu. */
  label: string | null;
  paymentUrl: string;
  /** Already formatted for the locale ("350 ₪"). */
  paymentAmount: string;
};

/** Sent by the therapist after a session: what it was, how much, and where to pay. */
export function paymentRequestEmailForClient(input: PaymentRequestEmailInput) {
  const m = getMessages(input.locale).messages;
  const when = fmtRange(input.startsAt, input.endsAt, input.timezone, input.locale);
  return {
    subject: m.paymentRequest.subject(input.therapistFullName),
    html: wrap(input.locale, `
      <h1 style="font-size:20px;margin:0 0 16px;">${esc(m.paymentRequest.title)}</h1>
      <p style="font-size:15px;line-height:1.6;">${esc(m.paymentRequest.lead(input.clientFullName, input.therapistFullName))}</p>
      <p style="font-size:16px;font-weight:bold;margin:16px 0;">${when}</p>
      ${input.label ? `<p style="font-size:15px;color:#4a4a4a;">${esc(m.paymentRequest.forLabel(input.label))}</p>` : ""}
      <p style="font-size:15px;line-height:1.6;margin-top:24px;">${esc(m.payment.line(input.paymentAmount))}</p>
      <p style="margin:8px 0 0;">
        <a href="${esc(input.paymentUrl)}" style="display:inline-block;background:#1f6feb;color:#fff;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:8px;">${esc(m.payment.link)}</a>
      </p>
    `),
  };
}

export type ConfirmationEmailInput = Localized & {
  clientFullName: string;
  therapistFullName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  location: string | null;
  manageUrl: string;
};

export function confirmationEmailForClient(input: ConfirmationEmailInput) {
  const m = getMessages(input.locale).messages;
  const when = fmtRange(input.startsAt, input.endsAt, input.timezone, input.locale);
  return {
    subject: m.confirmation.subject(input.therapistFullName),
    html: wrap(input.locale, `
      <h1 style="font-size:20px;margin:0 0 16px;">${esc(m.hello(input.clientFullName))}</h1>
      <p style="font-size:15px;line-height:1.6;">${esc(m.confirmation.lead(input.therapistFullName))}</p>
      <p style="font-size:16px;font-weight:bold;margin:16px 0;">${when}</p>
      ${input.location ? `<p style="font-size:15px;color:#4a4a4a;">${esc(m.location(input.location))}</p>` : ""}
      <p style="font-size:14px;line-height:1.6;margin-top:24px;">
        ${m.confirmation.icsAttached}
        ${m.confirmation.manageLine} <a href="${esc(input.manageUrl)}" style="color:#1f6feb;">${m.confirmation.manageLink}</a>.
      </p>
    `),
  };
}

export type TherapistNewBookingEmailInput = Localized & {
  therapistFullName: string;
  clientFullName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  /** Named only when the therapist works from more than one place. */
  placeName?: string | null;
};

export function newBookingEmailForTherapist(input: TherapistNewBookingEmailInput) {
  const m = getMessages(input.locale).messages;
  const when = fmtRange(input.startsAt, input.endsAt, input.timezone, input.locale);
  return {
    subject: m.newBooking.subject(input.clientFullName),
    html: wrap(input.locale, `
      <h1 style="font-size:20px;margin:0 0 16px;">${m.newBooking.title}</h1>
      <p style="font-size:15px;line-height:1.6;">${esc(m.newBooking.lead(input.clientFullName))}</p>
      <p style="font-size:16px;font-weight:bold;margin:16px 0;">${when}</p>
      ${input.placeName ? `<p style="font-size:15px;color:#4a4a4a;">${esc(m.location(input.placeName))}</p>` : ""}
    `),
  };
}

export type ReminderEmailInput = Localized & {
  clientFullName: string;
  therapistFullName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  location: string | null;
  manageUrl: string;
};

export function reminderEmailForClient(input: ReminderEmailInput) {
  const m = getMessages(input.locale).messages;
  const when = fmtRange(input.startsAt, input.endsAt, input.timezone, input.locale);
  return {
    subject: m.reminder.subject(input.therapistFullName),
    html: wrap(input.locale, `
      <h1 style="font-size:20px;margin:0 0 16px;">${m.reminder.title}</h1>
      <p style="font-size:15px;line-height:1.6;">${esc(m.reminder.lead(input.clientFullName, input.therapistFullName))}</p>
      <p style="font-size:16px;font-weight:bold;margin:16px 0;">${when}</p>
      ${input.location ? `<p style="font-size:15px;color:#4a4a4a;">${esc(m.location(input.location))}</p>` : ""}
      <p style="font-size:14px;line-height:1.6;margin-top:24px;">
        ${m.reminder.cancelLine} <a href="${esc(input.manageUrl)}" style="color:#1f6feb;">${m.reminder.manageLink}</a>.
      </p>
    `),
  };
}

export type ClientCanceledEmailInput = Localized & {
  therapistFullName: string;
  clientFullName: string;
  startsAt: Date;
  timezone: string;
};

export function cancellationEmailForTherapist(input: ClientCanceledEmailInput) {
  const m = getMessages(input.locale).messages;
  return {
    subject: m.canceledByClient.subject(input.clientFullName),
    html: wrap(input.locale, `
      <h1 style="font-size:20px;margin:0 0 16px;">${m.canceledByClient.title}</h1>
      <p style="font-size:15px;line-height:1.6;">${esc(m.canceledByClient.lead(input.clientFullName, day(input.startsAt, input.timezone, input.locale)))}</p>
    `),
  };
}

export type TherapistCanceledEmailInput = Localized & {
  clientFullName: string;
  therapistFullName: string;
  startsAt: Date;
  timezone: string;
  bookingPageUrl: string;
};

export function cancellationEmailForClient(input: TherapistCanceledEmailInput) {
  const m = getMessages(input.locale).messages;
  return {
    subject: m.canceledByTherapist.subject(input.therapistFullName),
    html: wrap(input.locale, `
      <h1 style="font-size:20px;margin:0 0 16px;">${m.canceledByTherapist.title}</h1>
      <p style="font-size:15px;line-height:1.6;">${esc(m.canceledByTherapist.lead(input.clientFullName, input.therapistFullName, day(input.startsAt, input.timezone, input.locale)))}</p>
      <p style="font-size:14px;line-height:1.6;margin-top:24px;">
        ${m.canceledByTherapist.rebookLine} <a href="${esc(input.bookingPageUrl)}" style="color:#1f6feb;">${m.canceledByTherapist.rebookLink}</a>.
      </p>
    `),
  };
}

export type RescheduledEmailInput = Localized & {
  therapistFullName: string;
  clientFullName: string;
  oldStartsAt: Date;
  newStartsAt: Date;
  timezone: string;
};

export function rescheduledEmailForTherapist(input: RescheduledEmailInput) {
  const m = getMessages(input.locale).messages;
  return {
    subject: m.rescheduled.subject(input.clientFullName),
    html: wrap(input.locale, `
      <h1 style="font-size:20px;margin:0 0 16px;">${m.rescheduled.title}</h1>
      <p style="font-size:15px;line-height:1.6;">${esc(m.rescheduled.lead(input.clientFullName))}</p>
      <p style="font-size:14px;color:#8a8a8a;text-decoration:line-through;margin:12px 0 4px;">${dateTime(input.oldStartsAt, input.timezone, input.locale)}</p>
      <p style="font-size:16px;font-weight:bold;margin:0;">${dateTime(input.newStartsAt, input.timezone, input.locale)}</p>
    `),
  };
}

/* ------------------------------------------------------------------------
 * Account mail — about the therapist's own account, not about a booking.
 * ---------------------------------------------------------------------- */

export type WelcomeEmailInput = Localized & {
  therapistFullName: string;
  onboardingUrl: string;
};

export function welcomeEmail(input: WelcomeEmailInput) {
  const m = getMessages(input.locale).messages;
  return {
    subject: m.welcome.subject,
    html: wrap(input.locale, `
      <h1 style="font-size:20px;margin:0 0 16px;">${esc(m.hello(input.therapistFullName))}</h1>
      <p style="font-size:15px;line-height:1.6;">${m.welcome.body1}</p>
      <p style="margin:24px 0;">
        <a href="${esc(input.onboardingUrl)}" style="background:#c67139;color:#f9f4ed;padding:12px 22px;border-radius:999px;text-decoration:none;font-size:15px;display:inline-block;">
          ${m.welcome.cta}
        </a>
      </p>
      <p style="font-size:14px;line-height:1.6;color:#6d6154;">${m.welcome.body2}</p>
    `),
  };
}

export type OnboardingCompleteEmailInput = Localized & {
  therapistFullName: string;
  bookingUrl: string;
  dashboardUrl: string;
};

export function onboardingCompleteEmail(input: OnboardingCompleteEmailInput) {
  const m = getMessages(input.locale).messages;
  return {
    subject: m.onboardingComplete.subject,
    html: wrap(input.locale, `
      <h1 style="font-size:20px;margin:0 0 16px;">${esc(m.onboardingComplete.title(input.therapistFullName))}</h1>
      <p style="font-size:15px;line-height:1.6;">${m.onboardingComplete.lead}</p>
      <p style="margin:16px 0;">
        <a href="${esc(input.bookingUrl)}" style="font-size:16px;font-weight:bold;color:#8c491a;word-break:break-all;">${esc(input.bookingUrl)}</a>
      </p>
      <p style="font-size:14px;line-height:1.6;color:#6d6154;">${m.onboardingComplete.body}</p>
      <p style="font-size:14px;line-height:1.6;margin-top:24px;">
        <a href="${esc(input.dashboardUrl)}" style="color:#8c491a;">${m.onboardingComplete.dashboardLink}</a>
      </p>
    `),
  };
}

export type SubscriptionEmailInput = Localized & {
  therapistFullName: string;
  /** Shown as-is — "Pro", "Basic". */
  tierLabel: string;
  status: "active" | "canceled" | "past_due";
  /** When the current paid period ends, if there is one. */
  periodEnd: Date | null;
  timezone: string;
  dashboardUrl: string;
};

export function subscriptionEmail(input: SubscriptionEmailInput) {
  const m = getMessages(input.locale).messages.subscription;
  const until = input.periodEnd ? day(input.periodEnd, input.timezone, input.locale) : null;
  const tier = esc(input.tierLabel);

  const body: Record<SubscriptionEmailInput["status"], { subject: string; lead: string; note: string }> = {
    active: {
      subject: m.activeSubject(input.tierLabel),
      lead: m.activeLead(tier),
      note: until ? m.activeNote(until) : "",
    },
    canceled: {
      subject: m.canceledSubject,
      lead: m.canceledLead,
      note: until ? m.canceledNoteUntil(until) : m.canceledNote,
    },
    past_due: {
      subject: m.pastDueSubject,
      lead: m.pastDueLead,
      note: m.pastDueNote,
    },
  };

  const { subject, lead, note } = body[input.status];
  const hello = getMessages(input.locale).messages.hello(input.therapistFullName);

  return {
    subject,
    html: wrap(input.locale, `
      <h1 style="font-size:20px;margin:0 0 16px;">${esc(hello)}</h1>
      <p style="font-size:15px;line-height:1.6;">${lead}</p>
      ${note ? `<p style="font-size:14px;line-height:1.6;color:#6d6154;">${note}</p>` : ""}
      <p style="font-size:14px;line-height:1.6;margin-top:24px;">
        <a href="${esc(input.dashboardUrl)}" style="color:#8c491a;">${m.dashboardLink}</a>
      </p>
    `),
  };
}

export type TrialEmailInput = Localized & {
  therapistFullName: string;
  /** Where the therapist is in the countdown. */
  stage:
    | { kind: "reminder"; daysLeft: number }
    | { kind: "ended"; graceDays: number }
    | { kind: "locked" }
    | { kind: "renewal_unconfirmed"; graceDays: number };
  /** The monthly price, already formatted for the locale. Null when none is configured. */
  price: string | null;
  billingUrl: string;
};

/**
 * The trial countdown. Three moments, one shape: where you are, what happens
 * next, and the one thing to do about it. Never a scare — the client-facing
 * side is explicitly said to keep working, because it does.
 */
export function trialEmail(input: TrialEmailInput) {
  const m = getMessages(input.locale).messages;
  const t = m.trial;
  const { subject, lead, note } = (() => {
    switch (input.stage.kind) {
      case "reminder":
        return input.stage.daysLeft <= 0
          ? { subject: t.lastDaySubject, lead: t.lastDayLead, note: input.price ? t.reminderNote(input.price) : "" }
          : {
              subject: t.reminderSubject(input.stage.daysLeft),
              lead: t.reminderLead(input.stage.daysLeft),
              note: input.price ? t.reminderNote(input.price) : "",
            };
      case "ended":
        return { subject: t.endedSubject, lead: t.endedLead(input.stage.graceDays), note: t.endedNote };
      case "locked":
        return { subject: t.lockedSubject, lead: t.lockedLead, note: t.lockedNote };
      case "renewal_unconfirmed":
        return { subject: t.unconfirmedSubject, lead: t.unconfirmedLead(input.stage.graceDays), note: t.unconfirmedNote };
    }
  })();

  return {
    subject,
    html: wrap(input.locale, `
      <h1 style="font-size:20px;margin:0 0 16px;">${esc(m.hello(input.therapistFullName))}</h1>
      <p style="font-size:15px;line-height:1.6;">${esc(lead)}</p>
      ${note ? `<p style="font-size:14px;line-height:1.6;color:#6d6154;">${esc(note)}</p>` : ""}
      <p style="margin:24px 0;">
        <a href="${esc(input.billingUrl)}" style="background:#c67139;color:#f9f4ed;padding:12px 22px;border-radius:999px;text-decoration:none;font-size:15px;display:inline-block;">
          ${esc(t.cta)}
        </a>
      </p>
    `),
  };
}

export type SignupAlertEmailInput = Localized & {
  therapistFullName: string;
  therapistEmail: string;
  signedUpAt: Date;
  timezone: string;
};

/** Internal — goes to the operator of Cleana+, not to a therapist. */
export function signupAlertEmail(input: SignupAlertEmailInput) {
  const m = getMessages(input.locale).messages.signupAlert;
  const when = dateTime(input.signedUpAt, input.timezone, input.locale);
  return {
    subject: m.subject(input.therapistFullName),
    html: wrap(input.locale, `
      <h1 style="font-size:20px;margin:0 0 16px;">${m.title}</h1>
      <p style="font-size:15px;line-height:1.8;">
        <strong>${esc(input.therapistFullName)}</strong><br/>
        <span style="color:#6d6154;">${esc(input.therapistEmail)}</span><br/>
        <span style="color:#6d6154;">${when}</span>
      </p>
    `),
  };
}

export type OpsAlertEmailInput = Localized & {
  /** One line per thing that went wrong, already in words. */
  problems: string[];
  ranAt: Date;
  timezone: string;
};

/** Internal — the daily job telling the operator what needs a person. */
export function opsAlertEmail(input: OpsAlertEmailInput) {
  const m = getMessages(input.locale).messages.opsAlert;
  return {
    subject: m.subject(input.problems.length),
    html: wrap(input.locale, `
      <h1 style="font-size:20px;margin:0 0 16px;">${m.title}</h1>
      <p style="font-size:14px;color:#6d6154;margin:0 0 12px;">${dateTime(input.ranAt, input.timezone, input.locale)}</p>
      <ul style="font-size:15px;line-height:1.8;padding-inline-start:20px;margin:0;">
        ${input.problems.map((line) => `<li>${esc(line)}</li>`).join("")}
      </ul>
    `),
  };
}
