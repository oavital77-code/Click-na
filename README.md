# Cleana+

מערכת SaaS לניהול תורים וזימונים למטפלים ובעלי מקצוע עצמאיים (קאוצ'ינג, טיפולי מגע, אימון אישי, ובהמשך גם פסיכולוגים ותחומים נוספים).

מסמך האפיון המלא של המוצר נמצא ב-[`docs/product-spec.md`](docs/product-spec.md) — כולל מודל עסקי, ארכיטקטורה, מודל נתונים, זרימות משתמש, אפיון API, אבטחה ו-Roadmap.

## Stack

- **Next.js 15** (App Router) + TypeScript
- **Tailwind CSS**

הפרויקט נבנה בשלבים בטוחים ומדורגים לפי ה-Roadmap במסמך האפיון (סעיף 12). Auth, DB, ותשלומים ייכנסו בשלבים הבאים.

## פיתוח מקומי

```bash
npm install
npm run dev
```

פותח על [http://localhost:3000](http://localhost:3000).
