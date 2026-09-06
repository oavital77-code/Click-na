import { formatInTimeZone } from "date-fns-tz";
import { he } from "date-fns/locale";

function formatSessionRange(startsAt: Date, endsAt: Date, timezone: string) {
  const day = formatInTimeZone(startsAt, timezone, "EEEE, d.M.yyyy", { locale: he });
  const startTime = formatInTimeZone(startsAt, timezone, "HH:mm");
  const endTime = formatInTimeZone(endsAt, timezone, "HH:mm");
  return `${day}, ${startTime}–${endTime}`;
}

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

function wrap(bodyHtml: string) {
  return `<!doctype html>
<html lang="he" dir="rtl">
  <body style="margin:0;padding:24px;background:#f6f5f3;font-family:Arial,Helvetica,sans-serif;color:#1f1f1f;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      ${bodyHtml}
      <!-- dir="ltr" on the wordmark: the name and the plus are separate runs, so
           an RTL paragraph reorders them and the footer reads "+Cleana". -->
      <p style="margin-top:32px;font-size:12px;color:#8a8a8a;">נשלח באמצעות <span dir="ltr">Cleana+</span></p>
    </div>
  </body>
</html>`;
}

export type ConfirmationEmailInput = {
  clientFullName: string;
  therapistFullName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  location: string | null;
  manageUrl: string;
};

export function confirmationEmailForClient(input: ConfirmationEmailInput) {
  const when = formatSessionRange(input.startsAt, input.endsAt, input.timezone);
  return {
    subject: `אישור תור אצל ${input.therapistFullName}`,
    html: wrap(`
      <h1 style="font-size:20px;margin:0 0 16px;">שלום ${esc(input.clientFullName)},</h1>
      <p style="font-size:15px;line-height:1.6;">התור שלך אצל ${esc(input.therapistFullName)} אושר:</p>
      <p style="font-size:16px;font-weight:bold;margin:16px 0;">${when}</p>
      ${input.location ? `<p style="font-size:15px;color:#4a4a4a;">מיקום: ${esc(input.location)}</p>` : ""}
      <p style="font-size:14px;line-height:1.6;margin-top:24px;">
        קובץ הזמנה ליומן מצורף להודעה זו.
        לצפייה בפרטי התור או לביטול, <a href="${esc(input.manageUrl)}" style="color:#1f6feb;">היכנסו לניהול ההזמנה</a>.
      </p>
    `),
  };
}

export type TherapistNewBookingEmailInput = {
  therapistFullName: string;
  clientFullName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
};

export function newBookingEmailForTherapist(input: TherapistNewBookingEmailInput) {
  const when = formatSessionRange(input.startsAt, input.endsAt, input.timezone);
  return {
    subject: `הזמנה חדשה: ${input.clientFullName}`,
    html: wrap(`
      <h1 style="font-size:20px;margin:0 0 16px;">הזמנה חדשה</h1>
      <p style="font-size:15px;line-height:1.6;">${esc(input.clientFullName)} קבע/ה תור אצלך:</p>
      <p style="font-size:16px;font-weight:bold;margin:16px 0;">${when}</p>
    `),
  };
}

export type ReminderEmailInput = {
  clientFullName: string;
  therapistFullName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  location: string | null;
  manageUrl: string;
};

export function reminderEmailForClient(input: ReminderEmailInput) {
  const when = formatSessionRange(input.startsAt, input.endsAt, input.timezone);
  return {
    subject: `תזכורת: תור אצל ${input.therapistFullName}`,
    html: wrap(`
      <h1 style="font-size:20px;margin:0 0 16px;">תזכורת לתור</h1>
      <p style="font-size:15px;line-height:1.6;">שלום ${esc(input.clientFullName)}, מזכירים לך על התור אצל ${esc(input.therapistFullName)}:</p>
      <p style="font-size:16px;font-weight:bold;margin:16px 0;">${when}</p>
      ${input.location ? `<p style="font-size:15px;color:#4a4a4a;">מיקום: ${esc(input.location)}</p>` : ""}
      <p style="font-size:14px;line-height:1.6;margin-top:24px;">
        צריכים לבטל? <a href="${esc(input.manageUrl)}" style="color:#1f6feb;">היכנסו לניהול ההזמנה</a>.
      </p>
    `),
  };
}

export type ClientCanceledEmailInput = {
  therapistFullName: string;
  clientFullName: string;
  startsAt: Date;
  timezone: string;
};

export function cancellationEmailForTherapist(input: ClientCanceledEmailInput) {
  const day = formatInTimeZone(input.startsAt, input.timezone, "d.M.yyyy", { locale: he });
  return {
    subject: `ביטול תור: ${input.clientFullName}`,
    html: wrap(`
      <h1 style="font-size:20px;margin:0 0 16px;">תור בוטל</h1>
      <p style="font-size:15px;line-height:1.6;">${esc(input.clientFullName)} ביטל/ה את התור שנקבע ל-${day}.</p>
    `),
  };
}

export type TherapistCanceledEmailInput = {
  clientFullName: string;
  therapistFullName: string;
  startsAt: Date;
  timezone: string;
  bookingPageUrl: string;
};

export function cancellationEmailForClient(input: TherapistCanceledEmailInput) {
  const day = formatInTimeZone(input.startsAt, input.timezone, "d.M.yyyy", { locale: he });
  return {
    subject: `התור אצל ${input.therapistFullName} בוטל`,
    html: wrap(`
      <h1 style="font-size:20px;margin:0 0 16px;">התור בוטל</h1>
      <p style="font-size:15px;line-height:1.6;">שלום ${esc(input.clientFullName)}, התור שלך אצל ${esc(input.therapistFullName)} ב-${day} בוטל על ידי המטפל/ת.</p>
      <p style="font-size:14px;line-height:1.6;margin-top:24px;">
        רוצים לקבוע תור חדש? <a href="${esc(input.bookingPageUrl)}" style="color:#1f6feb;">היכנסו לדף ההזמנות</a>.
      </p>
    `),
  };
}

export type RescheduledEmailInput = {
  therapistFullName: string;
  clientFullName: string;
  oldStartsAt: Date;
  newStartsAt: Date;
  timezone: string;
};

export function rescheduledEmailForTherapist(input: RescheduledEmailInput) {
  const oldWhen = formatInTimeZone(input.oldStartsAt, input.timezone, "d.M.yyyy, HH:mm", { locale: he });
  const newWhen = formatInTimeZone(input.newStartsAt, input.timezone, "d.M.yyyy, HH:mm", { locale: he });
  return {
    subject: `שינוי מועד: ${input.clientFullName}`,
    html: wrap(`
      <h1 style="font-size:20px;margin:0 0 16px;">מועד תור שונה</h1>
      <p style="font-size:15px;line-height:1.6;">${esc(input.clientFullName)} העביר/ה את התור:</p>
      <p style="font-size:14px;color:#8a8a8a;text-decoration:line-through;margin:12px 0 4px;">${oldWhen}</p>
      <p style="font-size:16px;font-weight:bold;margin:0;">${newWhen}</p>
    `),
  };
}


/* ------------------------------------------------------------------------
 * Account mail — about the therapist's own account, not about a booking.
 * ---------------------------------------------------------------------- */

export type WelcomeEmailInput = {
  therapistFullName: string;
  onboardingUrl: string;
};

export function welcomeEmail(input: WelcomeEmailInput) {
  return {
    subject: "ברוך הבא ל-Cleana+",
    html: wrap(`
      <h1 style="font-size:20px;margin:0 0 16px;">שלום ${esc(input.therapistFullName)},</h1>
      <p style="font-size:15px;line-height:1.6;">
        החשבון שלך נפתח. נשאר צעד אחד: להגדיר את שעות העבודה ולבחור את הכתובת האישית שלך —
        זה לוקח כמה דקות, ומהרגע שסיימת אפשר לשלוח את הקישור ללקוחות.
      </p>
      <p style="margin:24px 0;">
        <a href="${esc(input.onboardingUrl)}" style="background:#c67139;color:#f9f4ed;padding:12px 22px;border-radius:999px;text-decoration:none;font-size:15px;display:inline-block;">
          להשלמת ההגדרה
        </a>
      </p>
      <p style="font-size:14px;line-height:1.6;color:#6d6154;">
        לא צריך להתקין כלום, ולא צריך שהלקוחות שלך ייפתחו חשבון. הם פשוט פותחים את הקישור
        ובוחרים שעה.
      </p>
    `),
  };
}

export type OnboardingCompleteEmailInput = {
  therapistFullName: string;
  bookingUrl: string;
  dashboardUrl: string;
};

export function onboardingCompleteEmail(input: OnboardingCompleteEmailInput) {
  return {
    subject: "הקישור שלך פעיל",
    html: wrap(`
      <h1 style="font-size:20px;margin:0 0 16px;">${esc(input.therapistFullName)}, הכול מוכן.</h1>
      <p style="font-size:15px;line-height:1.6;">זו הכתובת האישית שלך. אפשר לשלוח אותה ללקוחות כבר עכשיו:</p>
      <p style="margin:16px 0;">
        <a href="${esc(input.bookingUrl)}" style="font-size:16px;font-weight:bold;color:#8c491a;word-break:break-all;">${esc(input.bookingUrl)}</a>
      </p>
      <p style="font-size:14px;line-height:1.6;color:#6d6154;">
        מי שפותח אותה רואה רק את השעות שפתחת. תור שנסגר נעלם מהרשימה מיד, ואתה מקבל על כך מייל.
      </p>
      <p style="font-size:14px;line-height:1.6;margin-top:24px;">
        <a href="${esc(input.dashboardUrl)}" style="color:#8c491a;">למעבר ליומן שלך</a>
      </p>
    `),
  };
}

export type SubscriptionEmailInput = {
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
  const until = input.periodEnd
    ? formatInTimeZone(input.periodEnd, input.timezone, "d.M.yyyy")
    : null;

  const body: Record<SubscriptionEmailInput["status"], { subject: string; lead: string; note: string }> = {
    active: {
      subject: `המנוי שלך פעיל — ${input.tierLabel}`,
      lead: `המנוי שלך במסלול ${esc(input.tierLabel)} פעיל.`,
      note: until ? `התקופה הנוכחית בתוקף עד ${until}.` : "",
    },
    canceled: {
      subject: "המנוי שלך בוטל",
      lead: "המנוי שלך בוטל, ולא תחויב יותר.",
      note: until
        ? `היומן והקישור שלך ממשיכים לעבוד עד ${until}.`
        : "היומן והקישור שלך ממשיכים לעבוד עד סוף התקופה ששולמה.",
    },
    past_due: {
      subject: "התשלום לא עבר",
      lead: "לא הצלחנו לחייב את אמצעי התשלום שבחשבון.",
      note: "היומן והקישור ממשיכים לעבוד בינתיים. עדכון אמצעי תשלום יסגור את זה.",
    },
  };

  const { subject, lead, note } = body[input.status];

  return {
    subject,
    html: wrap(`
      <h1 style="font-size:20px;margin:0 0 16px;">שלום ${esc(input.therapistFullName)},</h1>
      <p style="font-size:15px;line-height:1.6;">${lead}</p>
      ${note ? `<p style="font-size:14px;line-height:1.6;color:#6d6154;">${note}</p>` : ""}
      <p style="font-size:14px;line-height:1.6;margin-top:24px;">
        <a href="${esc(input.dashboardUrl)}" style="color:#8c491a;">לאזור האישי</a>
      </p>
    `),
  };
}

export type SignupAlertEmailInput = {
  therapistFullName: string;
  therapistEmail: string;
  signedUpAt: Date;
  timezone: string;
};

/** Internal — goes to the operator of Cleana+, not to a therapist. */
export function signupAlertEmail(input: SignupAlertEmailInput) {
  const when = formatInTimeZone(input.signedUpAt, input.timezone, "d.M.yyyy HH:mm");
  return {
    subject: `נרשם משתמש חדש: ${input.therapistFullName}`,
    html: wrap(`
      <h1 style="font-size:20px;margin:0 0 16px;">משתמש חדש</h1>
      <p style="font-size:15px;line-height:1.8;">
        <strong>${esc(input.therapistFullName)}</strong><br/>
        <span style="color:#6d6154;">${esc(input.therapistEmail)}</span><br/>
        <span style="color:#6d6154;">${when}</span>
      </p>
    `),
  };
}
