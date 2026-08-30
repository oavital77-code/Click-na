# Cleana+

מערכת SaaS לניהול תורים וזימונים למטפלים ובעלי מקצוע עצמאיים (קאוצ'ינג, טיפולי מגע, אימון אישי, ובהמשך גם פסיכולוגים ותחומים נוספים).

מסמך האפיון המלא של המוצר נמצא ב-[`docs/product-spec.md`](docs/product-spec.md) — כולל מודל עסקי, ארכיטקטורה, מודל נתונים, זרימות משתמש, אפיון API, אבטחה ו-Roadmap.

## Stack

- **Next.js 16** (App Router) + TypeScript, RTL/עברית, shadcn/ui-style components (`src/components/ui`)
- **Tailwind CSS**
- **PostgreSQL + Prisma** (`prisma/schema.prisma`) — מודל הנתונים המלא לפי סעיף 6 במסמך, כולל הגנת race-condition ברמת ה-DB מפני תורים חופפים (GiST exclusion constraint)
- **Clerk** — הרשמה/התחברות (`/login`, `/signup`), הגנת `/dashboard/*`
- **Vitest** — בדיקות יחידה + בדיקות אינטגרציה מול Postgres אמיתי (`src/lib/**/*.test.ts`)

הפרויקט נבנה בשלבים בטוחים ומדורגים לפי ה-Roadmap במסמך האפיון (סעיף 12). בנוי כרגע: Auth, Onboarding wizard, ניהול זמינות, דף הזמנה ציבורי מלא (Hold + Transaction), דשבורד הזמנות, הגדרות, דף נחיתה, והודעות מייל (אישור הזמנה + ICS, התראה למטפל, תזכורת מתוזמנת, הודעות ביטול — `src/lib/notifications.ts`, נשלח דרך Resend). לפי החלטת המוצר, ה-MVP לא כולל SMS — תזכורות נשלחות במייל בלבד. תשלומים (Stripe) ייכנסו כשיהיו מפתחות אמיתיים.

## פיתוח מקומי

1. התקנת תלויות (מריץ `prisma generate` אוטומטית):

   ```bash
   npm install
   ```

2. יצירת `.env` מ-`.env.example` ומילוי הערכים:

   - `DATABASE_URL` — חיבור ל-Postgres מקומי
   - מפתחות Clerk (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) מ-[dashboard.clerk.com](https://dashboard.clerk.com), או הרצת `npx clerk@latest init --keyless` ליצירת מפתחות פיתוח זמניים ללא צורך בחשבון
   - `CLERK_WEBHOOK_SIGNING_SECRET` — לאחר הגדרת Webhook endpoint ב-Clerk ל-`/api/webhooks/clerk` (אירועים: `user.created`, `user.deleted`)
   - `RESEND_API_KEY` — מ-[resend.com](https://resend.com), לשליחת הודעות מייל. ריק מקומית = מייל לא נשלח בפועל (נרשם `Notification` עם status `failed`), שאר הזרימה ממשיכה כרגיל
   - `CRON_SECRET` — סוד לאימות הקריאה מ-Vercel Cron ל-`/api/cron/send-reminders` (שולח תזכורות שהגיע זמנן). מוגדר אוטומטית ע"י Vercel כ-header `Authorization: Bearer <CRON_SECRET>`

3. הרצת מיגרציות מול ה-DB המקומי:

   ```bash
   npm run db:migrate
   ```

4. הרצה:

   ```bash
   npm run dev
   ```

   פותח על [http://localhost:3000](http://localhost:3000).

### פקודות נוספות

- `npm run db:studio` — ממשק לעיון בנתונים (Prisma Studio)
- `npm run lint` — ESLint
- `npm test` — בדיקות (דורש `DATABASE_URL` פעיל, כמו בפיתוח)
- `npm run test:watch` — בדיקות במצב watch
