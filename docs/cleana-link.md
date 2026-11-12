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

## אבטחה

- כתובת החזרה קבועה בסביבה, לא מהבקשה — אין דרך להפנות code לאתר זר.
- נשמר רק SHA-256 של המפתח ושל ה-code, מוצפן בשורת `integrations` (provider `cleana`).
- code נצרך פעם אחת, גם בשתי בקשות מקבילות (עדכון מותנה).
- ניתוק (כאן בתוספים, או מ-Cleana) והשעיית חשבון מבטלים את המפתח מיד.

## משתני סביבה

`CLEANA_RETURN_URL`, `CLEANA_CLIENT_SECRET` (ר' `.env.example`), ו-`INTEGRATION_ENCRYPTION_KEY` הקיים.

## עלויות

מבוסס אירועים בלבד: קריאה אחת לחיבור ואחת לניתוק. אין משימות מתוזמנות.
