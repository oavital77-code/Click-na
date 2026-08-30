import { formatInTimeZone } from "date-fns-tz";
import { he } from "date-fns/locale";

function formatSessionRange(startsAt: Date, endsAt: Date, timezone: string) {
  const day = formatInTimeZone(startsAt, timezone, "EEEE, d.M.yyyy", { locale: he });
  const startTime = formatInTimeZone(startsAt, timezone, "HH:mm");
  const endTime = formatInTimeZone(endsAt, timezone, "HH:mm");
  return `${day}, ${startTime}–${endTime}`;
}

function wrap(bodyHtml: string) {
  return `<!doctype html>
<html lang="he" dir="rtl">
  <body style="margin:0;padding:24px;background:#f6f5f3;font-family:Arial,Helvetica,sans-serif;color:#1f1f1f;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      ${bodyHtml}
      <p style="margin-top:32px;font-size:12px;color:#8a8a8a;">נשלח באמצעות Cleana+</p>
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
      <h1 style="font-size:20px;margin:0 0 16px;">שלום ${input.clientFullName},</h1>
      <p style="font-size:15px;line-height:1.6;">התור שלך אצל ${input.therapistFullName} אושר:</p>
      <p style="font-size:16px;font-weight:bold;margin:16px 0;">${when}</p>
      ${input.location ? `<p style="font-size:15px;color:#4a4a4a;">מיקום: ${input.location}</p>` : ""}
      <p style="font-size:14px;line-height:1.6;margin-top:24px;">
        קובץ הזמנה ליומן מצורף להודעה זו.
        לצפייה בפרטי התור או לביטול, <a href="${input.manageUrl}" style="color:#1f6feb;">היכנסו לניהול ההזמנה</a>.
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
      <p style="font-size:15px;line-height:1.6;">${input.clientFullName} קבע/ה תור אצלך:</p>
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
      <p style="font-size:15px;line-height:1.6;">שלום ${input.clientFullName}, מזכירים לך על התור אצל ${input.therapistFullName}:</p>
      <p style="font-size:16px;font-weight:bold;margin:16px 0;">${when}</p>
      ${input.location ? `<p style="font-size:15px;color:#4a4a4a;">מיקום: ${input.location}</p>` : ""}
      <p style="font-size:14px;line-height:1.6;margin-top:24px;">
        צריכים לבטל? <a href="${input.manageUrl}" style="color:#1f6feb;">היכנסו לניהול ההזמנה</a>.
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
      <p style="font-size:15px;line-height:1.6;">${input.clientFullName} ביטל/ה את התור שנקבע ל-${day}.</p>
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
      <p style="font-size:15px;line-height:1.6;">שלום ${input.clientFullName}, התור שלך אצל ${input.therapistFullName} ב-${day} בוטל על ידי המטפל/ת.</p>
      <p style="font-size:14px;line-height:1.6;margin-top:24px;">
        רוצים לקבוע תור חדש? <a href="${input.bookingPageUrl}" style="color:#1f6feb;">היכנסו לדף ההזמנות</a>.
      </p>
    `),
  };
}
