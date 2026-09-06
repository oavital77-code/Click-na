import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

// The CSP in src/proxy.ts mints a fresh nonce per request, and a page baked at
// build time cannot carry it — its scripts would be blocked in production only.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "מדיניות עוגיות — Cleana+" };

// A fixed date, not new Date() — see the same note in src/app/terms/page.tsx.
const LAST_UPDATED = "06/09/2026";

const SECTIONS = [
  {
    title: "1. אילו עוגיות בשימוש",
    body: [
      "Cleana+ משתמשת אך ורק בעוגיות הכרחיות — הנדרשות להתחברות ולאימות של המטפל/ת (שמירת מצב ההתחברות בין דפים, ומזהי session המנוהלים על ידי ספק האימות Clerk). עוגיות אלה חיוניות לתפקוד הבסיסי של השירות ולא ניתן לכבות אותן.",
      "דף ההזמנה הציבורי, שבו לקוחות מזמינים תור, אינו דורש התחברות ואינו מציב עוגיות מעקב.",
      "אין שימוש בעוגיות פרסום, מעקב שיווקי, או ניתוח סטטיסטי של גולשים. אם וכאשר יתווספו כלים כאלה, מדיניות זו תעודכן ותתבקש הסכמה כנדרש בדין.",
    ],
  },
  {
    title: "2. ניהול עוגיות",
    body: [
      "ניתן לחסום או למחוק עוגיות דרך הגדרות הדפדפן. חסימת העוגיות ההכרחיות תמנע התחברות לחשבון המטפל/ת, אך לא תשפיע על יכולת הלקוחות להזמין תור.",
    ],
  },
];

export default function CookiesPage() {
  return (
    <LegalPage
      title="מדיניות עוגיות"
      lastUpdated={LAST_UPDATED}
      sections={SECTIONS}
      related={{ href: "/privacy", label: "מדיניות הפרטיות" }}
    />
  );
}
