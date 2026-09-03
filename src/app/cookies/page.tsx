import type { Metadata } from "next";
import { LegalDraftNotice } from "@/components/legal-draft-notice";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = { title: "מדיניות עוגיות — Cleana+" };

export default function CookiesPage() {
  return (
    <>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-12 md:px-8">
        <h1 className="text-center text-3xl font-bold md:text-start">מדיניות עוגיות</h1>
        <LegalDraftNotice />

        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">אילו עוגיות אנחנו משתמשים בהן</h2>
          <p>
            כרגע Cleana+ משתמשת אך ורק בעוגיות <strong>חיוניות</strong> — הנדרשות לצורך התחברות
            ואימות משתמש (למשל שמירת מצב ההתחברות שלך בין דפים). עוגיות אלה חיוניות לתפקוד
            הבסיסי של האתר ולא ניתן לכבות אותן.
          </p>
          <p>
            אנחנו לא משתמשים כרגע בעוגיות פרסום, מעקב שיווקי, או ניתוח סטטיסטי של גולשים. אם
            וכאשר נוסיף כלים כאלה, נעדכן מדיניות זו ונבקש הסכמה כנדרש בחוק.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">ניהול עוגיות</h2>
          <p>
            ניתן לחסום או למחוק עוגיות דרך הגדרות הדפדפן, אך שים לב שחסימת עוגיות חיוניות תמנע
            התחברות למערכת.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
