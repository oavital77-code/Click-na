import type { Metadata } from "next";
import Link from "next/link";
import { LegalDraftNotice } from "@/components/legal-draft-notice";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = { title: "מדיניות פרטיות — Cleana+" };

export default function PrivacyPage() {
  return (
    <>
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-bold">מדיניות פרטיות</h1>
      <LegalDraftNotice />

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">איזה מידע אנחנו אוספים</h2>
        <p>
          <strong>ממטפלים:</strong> שם, אימייל, טלפון, ותוכן שהם בוחרים להזין בהגדרות המערכת
          (תחום עיסוק, מיקום, מדיניות ביטול וכו&apos;).
        </p>
        <p>
          <strong>מלקוחות שמזמינים תור:</strong> שם, טלפון, אימייל, והערה לוגיסטית קצרה (עד 200
          תווים) — בלבד. <strong>אנחנו לא אוספים ולא מבקשים מידע רפואי, אבחוני, או כל מידע רגיש
          אחר.</strong>
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">למה המידע נאסף</h2>
        <p>
          המידע משמש אך ורק לתפעול השירות: הצגת זמינות, יצירת הזמנה, שליחת אישורים ותזכורות
          למי שביקש זאת, וניהול קשרי הלקוחות של המטפל בתוך המערכת.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">שיתוף מידע עם צדדים שלישיים</h2>
        <p>
          אנחנו משתמשים בספקי תשתית לצורך הפעלת השירות — לרבות אימות משתמשים, אחסון נתונים,
          ותקשורת. ספקים אלה מעבדים מידע בשמנו בלבד ואינם רשאים להשתמש בו למטרה אחרת.
          אנחנו לא מוכרים מידע אישי לצד שלישי כלשהו.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">אבטחת מידע</h2>
        <ul className="list-inside list-disc">
          <li>הצפנה בתעבורה (TLS) ובמנוחה.</li>
          <li>
            בידוד נתונים בין מטפלים — כל שאילתה במערכת מסוננת לפי זהות המטפל המחובר, הן ברמת
            הקוד והן ברמת בסיס הנתונים.
          </li>
          <li>מינימיזציה — אנו אוספים רק את המידע הדרוש לתפעול השירות.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">שמירת מידע ומחיקה</h2>
        <p>
          הזמנות ישנות נשמרות לתקופה מוגבלת לצורכי תפעול ותמיכה, ולאחריה מוסרות בהתאם למדיניות
          השמירה של המערכת. מטפל שמוחק את חשבונו — הגישה שלו למערכת מבוטלת, ודף ההזמנה הציבורי
          שלו מפסיק להיות פעיל.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">הזכויות שלך</h2>
        <p>
          מטפל רשום יכול לייצא עותק של המידע שלו במערכת בכל עת דרך הגדרות החשבון, ולבקש מחיקת
          חשבון. לקוח שהזמין תור יכול לפנות למטפל שאצלו הוזמן התור, או אלינו ישירות (ראו יצירת
          קשר למטה), לבירור או עדכון המידע שלו.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">עוגיות</h2>
        <p>
          פירוט על השימוש בעוגיות באתר מופיע ב
          <Link href="/cookies" className="text-primary underline underline-offset-4">
            {" "}
            מדיניות העוגיות
          </Link>
          .
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">יצירת קשר</h2>
        <p>לשאלות בנושאי פרטיות ניתן לפנות אלינו דרך פרטי הקשר המופיעים באתר.</p>
      </section>
    </main>
    <SiteFooter />
    </>
  );
}
