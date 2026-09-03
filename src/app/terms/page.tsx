import type { Metadata } from "next";
import { LegalDraftNotice } from "@/components/legal-draft-notice";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = { title: "תנאי שימוש — Cleana+" };

export default function TermsPage() {
  return (
    <>
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-12 md:px-8">
      <h1 className="text-center text-3xl font-bold md:text-start">תנאי שימוש</h1>
      <LegalDraftNotice />

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">1. הגדרות</h2>
        <p>
          <strong>&quot;המערכת&quot;</strong> — שירות Cleana+ לניהול תורים וזימונים.{" "}
          <strong>&quot;מטפל&quot;</strong> — בעל המקצוע העצמאי הנרשם למערכת ומשלם עבורה.{" "}
          <strong>&quot;לקוח&quot;</strong> — מי שמזמין תור דרך דף ההזמנה הציבורי של מטפל, ואינו
          משתמש רשום במערכת.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">2. השירות</h2>
        <p>
          Cleana+ הוא כלי לניהול יומן ותיאום תורים בלבד. המערכת אינה מהווה כלי לתיעוד רפואי,
          אבחון, או ניהול תיק טיפולי, ואינה מיועדת לאחסון מידע רפואי או מידע רגיש אחר. האחריות
          המקצועית על הטיפול הניתן ללקוחות היא של המטפל בלבד.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">3. המודל העסקי</h2>
        <p>
          הקשר החוזי במסגרת שירות זה הוא בין Cleana+ לבין המטפל בלבד, בתמורה לדמי מנוי חודשיים
          או שנתיים לפי המסלול שנבחר. Cleana+ אינה צד לתשלום המתבצע בין המטפל ללקוחותיו, אינה
          גובה עמלה על טיפולים, ואינה מעורבת בגבייה כלשהי בין המטפל ללקוחותיו.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">4. אחריות המטפל</h2>
        <ul className="list-inside list-disc">
          <li>המטפל אחראי לדיוק הפרטים המוצגים בדף ההזמנה הציבורי שלו.</li>
          <li>
            שדה &quot;הערה לוגיסטית&quot; מיועד למידע לוגיסטי בלבד (למשל &quot;חניה בחצר&quot;).
            אין להזין בו מידע רפואי, אבחוני או אישי רגיש — האחריות על תוכן שדה זה היא של המטפל
            בלבד.
          </li>
          <li>המטפל אחראי לעמידה בכל חובה מקצועית, רגולטורית או חוקית החלה עליו בתחום עיסוקו.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">5. מסלולי מנוי והגבלות</h2>
        <p>
          מסלול Free כפוף למגבלות שימוש (מספר חלונות טיפול והזמנות חודשיות) כמפורט בעמוד
          המחירים. שדרוג או ביטול מסלול מתבצעים מתוך הגדרות החשבון. ביטול מנוי אינו מוחק הזמנות
          עתידיות קיימות ואינו משבית את דף ההזמנה הציבורי — החשבון עובר למגבלות מסלול Free.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">6. מחיקת חשבון</h2>
        <p>
          מטפל רשאי למחוק את חשבונו בכל עת דרך ניהול החשבון. מחיקת חשבון היא בלתי הפיכה מבחינת
          הגישה של המטפל למערכת; שמירת נתונים היסטוריים כפופה למדיניות הפרטיות.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">7. הגבלת אחריות</h2>
        <p>
          השירות ניתן &quot;כפי שהוא&quot; (AS IS). Cleana+ אינה אחראית לנזק עקיף שייגרם כתוצאה
          משימוש במערכת, לרבות אך לא רק אובדן הזמנות עקב תקלה טכנית, ותפעל לתקן תקלות ידועות
          במהירות הסבירה.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">8. שינויים בתנאים</h2>
        <p>
          Cleana+ רשאית לעדכן תנאים אלה מעת לעת. שינוי מהותי יובא לידיעת המטפלים הרשומים.
        </p>
      </section>
    </main>
    <SiteFooter />
    </>
  );
}
