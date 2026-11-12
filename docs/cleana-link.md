# חיבור Cleana ↔ Cleana+ (שלב 1: חיבור חשבונות)

Cleana (השכרת חדרים) יכולה לפתוח ולסגור משבצות ביומן של מטפל/ת ב-Cleana+,
אחרי שהמטפל/ת אישר/ה פעם אחת. הקוד: `src/lib/cleana-link.ts`.

## הזרימה

1. Cleana מפנה ל-`/connect/cleana?state=…`. לא מחובר/ת? Clerk מעביר ל-`/login` וחוזר.
2. "אישור" → `POST /api/integrations/cleana/authorize` → הפניה ל-`CLEANA_RETURN_URL`
   עם `code` חד-פעמי (5 דקות) ו-`state`. "לא עכשיו" → `error=access_denied`.
3. השרת של Cleana → `POST /api/integrations/cleana/token` עם
   `Authorization: Bearer $CLEANA_CLIENT_SECRET` ו-`{code}` → `{access_token}`.
4. כל קריאה של Cleana בשם מטפל/ת: `Authorization: Bearer clp_<id>.<secret>`.
   המטפל/ת נקבע/ת **רק** מהמפתח (`therapistForCleanaToken`).
   - `GET /api/integrations/cleana/status` — האם המפתח עדיין תקף.
   - `POST /api/integrations/cleana/revoke` — ניתוק מצד Cleana.

## פתיחת שעות (שלב 2)

`POST /api/integrations/cleana/slots` עם המפתח של המטפל/ת. גוף הבקשה:
`{bookingId, branch: {id, name, address}, room, startsAt, endsAt}` (`src/lib/cleana-slots.ts`).

- **פירוק לתורים.** החדר מתחלק לפי אורך הטיפול וההפסקה שבהגדרות (`defaultDurationMinutes`,
  `bufferAfterMinutes`), החל משעת ההתחלה. תור שלא נכנס במלואו לא נפתח. החישוב על השעות
  העגולות, בלי 5 דקות הכניסה והפינוי.
- **סניף ← מיקום.** קודם מיקום שכבר מקושר לסניף (`locations.cleana_branch_id`), אחר כך
  מיקום באותה כתובת (ומקשרים אותו), ואם אין — "בקליניקה — <סניף>". נוצר תחת נעילה, כך
  ששתי בקשות במקביל יוצרות מיקום אחד.
- **אידמפוטנטי.** (מטפל/ת, הזמנה ב-Cleana, שעת התחלה) ייחודי — לחיצה כפולה או ניסיון חוזר לא
  פותחים פעמיים. משבצת שחופפת למשהו ביומן מדולגת (`overlap`), וכך גם משבצת שכבר עברה (`past`).
- **שם החדר** (`sessions.cleana_room`) מוצג רק למטפל/ת ביומן, לא ללקוחות.
- **חשבון נעול** (מנוי שפג) → 402 `subscription_inactive`.

## ביטולים ושינויים (שלב 3)

- `GET /api/integrations/cleana/slots?bookingId=…` — אילו משבצות של ההזמנה לקוח/ה קבע/ה (או
  באמצע קביעה). שעות בלבד, בלי שמות. Cleana מציגה אזהרה לפני ביטול.
- `POST /api/integrations/cleana/slots/close` `{bookingId}` — החדר בוטל או הוזז:
  - משבצות פנויות נסגרות (`canceled`) ומנותקות מההזמנה, כך שאפשר לפתוח אותן שוב.
  - תור שנקבע **לא** מבוטל: מסומן `cleana_room_canceled_at` ("אין חדר" ביומן), והמטפל/ת
    מקבל/ת מייל אחד עם השעות ושמות הלקוחות.
  - בטוח לחזרה: קריאה שנייה לא סוגרת כלום ולא שולחת מייל.
  - לא חסום במנוי נעול — סגירה של חדר שאיננו תמיד עוברת.
- תור "אין חדר" שהלקוח/ה ביטל/ה או הזיז/ה **לא** נפתח מחדש. תור רגיל שבוטל נפתח מחדש עם
  הקישור להזמנה ב-Cleana, כך שביטול מאוחר בחדר עדיין סוגר אותו.

## אבטחה

- כתובת החזרה קבועה בסביבה, לא מהבקשה — אין דרך להפנות code לאתר זר.
- נשמר רק SHA-256 של המפתח ושל ה-code, מוצפן בשורת `integrations` (provider `cleana`).
- code נצרך פעם אחת, גם בשתי בקשות מקבילות (עדכון מותנה).
- ניתוק (כאן בתוספים, או מ-Cleana) והשעיית חשבון מבטלים את המפתח מיד.

## משתני סביבה

`CLEANA_RETURN_URL`, `CLEANA_CLIENT_SECRET` (ר' `.env.example`), ו-`INTEGRATION_ENCRYPTION_KEY` הקיים.

## עלויות

מבוסס אירועים בלבד: קריאה אחת לחיבור ואחת לניתוק. אין משימות מתוזמנות.
