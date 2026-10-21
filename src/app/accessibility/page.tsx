import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

// The CSP in src/proxy.ts mints a fresh nonce per request, and a page baked at
// build time cannot carry it — its scripts would be blocked in production only.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "הצהרת נגישות — Cleana+" };

const CONTACT_EMAIL = "baclinica5@gmail.com";
const CONTACT_WHATSAPP = "052-2474885";
// A fixed date, not new Date() — see the same note in src/app/terms/page.tsx.
const LAST_UPDATED = "21/10/2026";

// Describes only what this codebase actually does, and does not claim more.
const SECTIONS = [
  {
    title: "1. המחויבות שלנו",
    body: [
      "Cleana+ רואה חשיבות רבה בכך שכל אדם, כולל אנשים עם מוגבלות, יוכל להשתמש באתר ובמערכת בקלות ובעצמאות: מטפלים שמנהלים את היומן שלהם, ומטופלים שקובעים תור.",
      "אנחנו פועלים להתאים את האתר לתקן הישראלי 5568 ולהנחיות WCAG 2.1 ברמה AA, בהתאם לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע\"ג-2013.",
    ],
  },
  {
    title: "2. מה עשינו",
    body: [
      "האתר בנוי בעברית מימין לשמאל, ושפת כל עמוד מוגדרת כך שתוכנות הקראה יקראו אותו נכון.",
      "אפשר לנווט באתר ובמערכת באמצעות המקלדת בלבד, והרכיב שנמצא בפוקוס מסומן במסגרת בולטת.",
      "לכפתורים ולרכיבים שאין עליהם טקסט (למשל כפתור פתיחת התפריט או מתגים) יש תיאור שתוכנות הקראה מקריאות.",
      "אזורי הלחיצה בכפתורים ובקישורים גדולים מספיק לשימוש נוח בטלפון.",
      "סרטון ההסבר בדף הבית כולל כתוביות בעברית, והוא לא מתנגן מעצמו.",
      "הטקסט כתוב בשפה פשוטה, בגופן אחד וברור, ואפשר להגדיל אותו בהגדרות הדפדפן בלי שהתוכן יישבר.",
      "שדות בטפסים מסומנים בתווית, והודעות שגיאה מופיעות ליד השדה שצריך לתקן.",
    ],
  },
  {
    title: "3. מה עוד לא מושלם",
    body: [
      "למרות המאמצים להנגיש את כל חלקי האתר, ייתכן שיש חלקים שעדיין אינם נגישים במלואם. אנחנו ממשיכים לבדוק ולשפר, ונשמח לשמוע על כל בעיה.",
      "מסכי ההרשמה והכניסה מסופקים על ידי שירות חיצוני (Clerk), ודף התשלום בכרטיס אשראי מסופק על ידי PayPlus. רמת הנגישות שלהם נקבעת על ידי הספקים האלה.",
    ],
  },
  {
    title: "4. רכז הנגישות",
    body: [`רכז הנגישות של Cleana+ הוא יואב בלחסן. אפשר לפנות אליו במייל ${CONTACT_EMAIL} או בוואטסאפ ${CONTACT_WHATSAPP}.`],
  },
  {
    title: "5. נתקלתם בבעיה? נשמח לשמוע",
    body: [
      `אם משהו באתר לא נגיש לכם, או שאתם צריכים מידע בדרך אחרת, אפשר לפנות אלינו במייל ${CONTACT_EMAIL} או בוואטסאפ ${CONTACT_WHATSAPP}. כדאי לציין באיזה עמוד הייתה הבעיה, מה ניסיתם לעשות, ובאיזה מכשיר ודפדפן השתמשתם.`,
      "נחזור אליכם בהקדם, ובכל מקרה תוך 14 ימים.",
    ],
  },
];

export default function AccessibilityPage() {
  return <LegalPage title="הצהרת נגישות" lastUpdated={LAST_UPDATED} sections={SECTIONS} />;
}
