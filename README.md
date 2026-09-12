# Cleana+

מערכת SaaS לניהול תורים וזימונים למטפלים ובעלי מקצוע עצמאיים (קאוצ'ינג, טיפולי מגע, אימון אישי, ובהמשך גם פסיכולוגים ותחומים נוספים).

**להרצה, לתפעול ולתיקון תקלות — [`docs/HANDBOOK.md`](docs/HANDBOOK.md).**
לדיווח על פגיעת אבטחה — [`SECURITY.md`](SECURITY.md). לתנאי השימוש בקוד — [`LICENSE`](LICENSE).

מסמך האפיון המלא של המוצר נמצא ב-[`docs/product-spec.md`](docs/product-spec.md) — כולל מודל עסקי, ארכיטקטורה, מודל נתונים, זרימות משתמש, אפיון API, אבטחה ו-Roadmap.

## Stack

- **Next.js 16** (App Router) + TypeScript, RTL/עברית, shadcn/ui-style components (`src/components/ui`)
- **Tailwind CSS v4** — שפה עיצובית "Nocturne" ([`docs/design/nocturne-design-language.pdf`](docs/design/nocturne-design-language.pdf)): dark-first, גופן Heebo, סולם מרווחים צפוף (×0.7), טוקנים ב-`src/app/globals.css`
- **PostgreSQL + Prisma** (`prisma/schema.prisma`) — מודל הנתונים המלא לפי סעיף 6 במסמך, כולל הגנת race-condition ברמת ה-DB מפני תורים חופפים (GiST exclusion constraint)
- **Clerk** — הרשמה/התחברות (`/login`, `/signup`), הגנת `/dashboard/*`
- **Vitest** — בדיקות יחידה + בדיקות אינטגרציה מול Postgres אמיתי (`src/lib/**/*.test.ts`)

הפרויקט נבנה בשלבים בטוחים ומדורגים לפי ה-Roadmap במסמך האפיון (סעיף 12). בנוי כרגע: Auth, Onboarding wizard, ניהול זמינות, דף הזמנה ציבורי מלא (Hold + Transaction), דשבורד הזמנות, הגדרות, דף נחיתה, והודעות מייל (אישור הזמנה + ICS, התראה למטפל, תזכורת מתוזמנת, הודעות ביטול — `src/lib/notifications.ts`, נשלח דרך Resend). לפי החלטת המוצר, ה-MVP לא כולל SMS — תזכורות נשלחות במייל בלבד. החיוב בנוי ופעיל מול **PayPlus** בשיטת טוקן: 30 יום התנסות, 7 ימי חסד, וחידוש חודשי שה-cron שלנו מבצע — ר' פרק 8 ב-[`docs/HANDBOOK.md`](docs/HANDBOOK.md).

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

## פרודקשן (Vercel)

מול DB עם connection pooler (כמו Supabase) צריך **שני** משתני סביבה נפרדים, לא רק `DATABASE_URL`:

- `DATABASE_URL` — מחרוזת ה-pooler (transaction mode, פורט 6543, `?pgbouncer=true`) — זה מה שהאפליקציה עצמה משתמשת בו ב-runtime (`src/lib/prisma.ts`), מתאים לסביבת serverless.
- `DIRECT_URL` — חיבור ישיר (לא דרך pooler, פורט 5432) — נחוץ רק לפקודות `prisma migrate` (`prisma.config.ts` קורא אותו). ה-pooler במצב transaction לא תומך ב-DDL/advisory locks שמיגרציות צריכות.

כדי שהסכימה תתעדכן אוטומטית בכל דיפלוי, מגדירים ב-Vercel Project Settings → **Build Command**:

```
npx prisma migrate deploy && npm run build
```

### תוספים (Add-ons)

לשונית "תוספים" בדשבורד מאפשרת לכל מטפל לחבר את החשבונות שלו — Twilio לוואטסאפ, Stripe לתשלומים, Zoom לפגישות. הפרטים נשמרים מוצפנים (AES-256-GCM) ולכן נדרש משתנה סביבה אחד:

```
INTEGRATION_ENCRYPTION_KEY   # 32 בייטים אקראיים ב-base64
```

יצירה:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

בלעדיו התוספים שדורשים חשבון מסרבים לשמור פרטים; סנכרון היומן עובד גם בלי. החלפת המפתח הופכת את כל הפרטים השמורים לבלתי קריאים, וכל מטפל יצטרך להזין אותם מחדש.


## מיילים

שני סוגים, שניהם דרך Resend ושניהם נרשמים בטבלת `notifications` עם התוצאה — כך שכישלון שליחה הוא שורה שאפשר למצוא ולא שגיאה שנעלמה.

**סביב תור** (`src/lib/notifications.ts`): אישור ללקוח עם קובץ יומן, עדכון למטפל, תזכורת לפני המפגש, ביטול ושינוי מועד. חלקם נשלחים גם בוואטסאפ כשהתוסף מחובר, כערוץ נפרד — כישלון באחד לא מפיל את השני.

**סביב החשבון** (`src/lib/account-emails.ts`):

| מתי | למי | מה |
| --- | --- | --- |
| נפתח חשבון | המטפל | ברוך הבא + הקישור להשלמת ההגדרה |
| נפתח חשבון | המפעיל | התראה פנימית, רק אם `OWNER_NOTIFICATION_EMAIL` מוגדר |
| ההגדרה הושלמה | המטפל | הקישור הציבורי שלו, פעיל |
| שינוי מנוי | המטפל | אישור הפעלה / ביטול / תשלום שנכשל |

כל השליחות האלה קורות **אחרי** שהתשובה נשלחה (`after()`), כדי שהמשתמש לא ימתין להן — ובמקרה של ה-webhook של Clerk, גם כדי ש-Clerk לא ינסה שוב וייצור מייל כפול.

מייל שנכשל לעולם לא מפיל את הפעולה שהוא מדווח עליה. חשבון שנפתח חשוב יותר מההודעה עליו.

**שינוי מנוי** (`src/lib/subscriptions.ts`) מחובר לזרימת החיוב של PayPlus: הוא נקרא מה-callback של התשלום ומ-`billing-lifecycle` כשהתנסות נגמרת, חסד אוזל או חידוש נכשל.

## אבטחה

### כותרות אבטחה ו-CSP

כל תגובה נושאת HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` ו-`Permissions-Policy` (מוגדרות ב-`next.config.ts`).

ה-Content-Security-Policy נוצר בנפרד, ב-`src/proxy.ts`, דרך `clerkMiddleware`. הסיבה: הוא משתמש ב-nonce שנוצר מחדש בכל בקשה, ורשימת המקורות ש-Clerk צריך היא של Clerk לתחזק — למשל מסגרת ה-Turnstile שהגנת הבוטים שלה טוענת, שמדיניות שנכתבת ביד הייתה שוכחת ושוברת בשקט את ההרשמה.

**המשמעות:** כל עמוד באפליקציה נטען דינמית. עמוד שנבנה מראש לא יכול לשאת nonce שנוצר בכל בקשה, והסקריפטים שלו היו נחסמים — בפרודקשן בלבד. לכן `/`, `/terms`, `/privacy` ו-`/cookies` מסומנים `force-dynamic`.

### הרשאות בבסיס הנתונים (RLS)

RLS מופעל על כל הטבלאות, **בלי מדיניות**. זה נשמע כמו טעות והוא לא:

Supabase חושפת כל טבלה דרך PostgREST לתפקידי `anon` ו-`authenticated`. בלי RLS, מי שמחזיק במפתח הפומבי קורא וכותב כל שורה. המדיניות המקובלת מבוססת על `auth.jwt() ->> 'sub'`, אבל היא לא מתאימה כאן: האפליקציה לא משתמשת ב-Supabase Auth ולא בלקוח של Supabase כלל — היא ניגשת ל-Postgres ישירות דרך Prisma כבעלת הטבלאות, וההרשאות נאכפות בקוד לפי `therapistId` שנגזר מהסשן המאומת של Clerk.

RLS פעיל בלי מדיניות = דחייה מוחלטת לתפקידים האלה, ושקוף לבעלת הטבלאות. אומת: תפקיד עם הרשאות `SELECT/INSERT/UPDATE/DELETE` מלאות רואה אפס שורות ולא מצליח לכתוב.

לביטול: `ALTER TABLE "<שם>" DISABLE ROW LEVEL SECURITY;`

### הגבלת קצב

נקודות הקצה הציבוריות מוגבלות דרך טבלת `rate_limits` ב-Postgres (`src/lib/rate-limit.ts`) — בלי שירות חיצוני נוסף:

| נתיב | תקרה |
| --- | --- |
| `POST /api/public/bookings` | 10 לשעה לכתובת IP |
| `POST /api/public/sessions/[id]/hold` | 30 לעשר דקות לכתובת IP |

חלונות שפג תוקפם נמחקים בתוך ה-cron של התזכורות.

### DNS לדואר יוצא

רלוונטי כשמחברים דומיין משלך ל-Resend. עד אז השליחה היא מדומיין הבדיקות של Resend ואין מה להגדיר.

```
SPF    TXT @      v=spf1 include:amazonses.com include:resend.com ~all
DKIM   CNAME      הרשומות ש-Resend מנפיקה עבור הדומיין
DMARC  TXT _dmarc v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc-reports@<הדומיין שלך>
```

מומלץ להתחיל ב-`p=none`, לקרוא את הדוחות שבועיים-שלושה, ורק אז לעבור ל-`p=quarantine`. מעבר ישיר עלול להעיף לספאם דואר לגיטימי שנשלח ממקור שלא נכלל ב-SPF.
