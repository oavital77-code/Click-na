import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, HandHeart, Dumbbell, GraduationCap, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Cleana+ — תוכנה לניהול תורים למטפלים",
  description:
    "תוכנה לניהול תורים למטפלים, מאמנים ובעלי מקצוע עצמאיים. קישור אישי, הלקוחות מזמינים בעצמם, ללא תורים כפולים. התחילו בחינם ללא כרטיס אשראי.",
};

const PROBLEM_SOLUTION = [
  {
    problem: "התכתבות ווטסאפ מתישה לתיאום כל תור",
    solution: "קישור אחד — הלקוח בוחר בעצמו",
  },
  {
    problem: "תורים כפולים וטעויות ביומן",
    solution: "המערכת חוסמת חפיפות אוטומטית",
  },
  {
    problem: "תזכורות ידניות שלוקחות זמן",
    solution: "תזכורות אוטומטיות ללקוח",
  },
];

const AUDIENCE = [
  { icon: Briefcase, label: "קאוצ'ינג" },
  { icon: HandHeart, label: "טיפולי מגע" },
  { icon: Dumbbell, label: "אימון אישי" },
  { icon: GraduationCap, label: "הוראה פרטית" },
  { icon: Stethoscope, label: "טיפול וייעוץ" },
];

const TIERS = [
  { name: "Free", price: "₪0", tagline: "כדי להתנסות", features: ["5 חלונות טיפול", "15 הזמנות בחודש", "דף הזמנה ציבורי"] },
  { name: "Basic", price: "$10/חודש", tagline: "לעצמאי הפעיל", features: ["ללא הגבלת הזמנות", "תזכורות במייל", "זמינות חוזרת"] },
  { name: "Pro", price: "$25/חודש", tagline: "הכי פופולרי", features: ["תזכורות SMS", "מיתוג אישי", "דוחות ואנליטיקס"] },
  { name: "Business", price: "$50/חודש", tagline: "לקליניקה", features: ["כתובת אישית", "גישת API", "תמיכה מועדפת"] },
];

const FAQ = [
  {
    q: "האם יש עמלות על תשלומים מהלקוחות שלי?",
    a: "לא. Cleana+ הוא מנוי חודשי קבוע בלבד — אנחנו לא נוגעים בכסף שעובר בינך ללקוחות שלך.",
  },
  {
    q: "האם אני צריך כרטיס אשראי כדי להתחיל?",
    a: "לא. מסלול Free זמין לגמרי ללא כרטיס אשראי.",
  },
  {
    q: "כמה זמן לוקח להקים את הקישור שלי?",
    a: "פחות מ-3 דקות מרגע ההרשמה ועד שיש לך קישור פעיל לשלוח ללקוחות.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="flex flex-col items-center gap-6 px-4 py-16 text-center">
        <h1 className="max-w-2xl text-4xl font-bold text-balance sm:text-5xl">
          תפסיקו לתאם תורים בווטסאפ
        </h1>
        <p className="text-muted-foreground max-w-md text-lg">
          קישור אישי אחד — הלקוחות שלך משבצים את עצמם, והיומן מתנהל לבד. בלי תורים כפולים, בלי
          עשרות הודעות &ldquo;מתי אתה פנוי?&rdquo;.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/signup">התחל בחינם — ללא כרטיס אשראי</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">כבר יש לך חשבון? התחבר</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-10 sm:grid-cols-3">
        {PROBLEM_SOLUTION.map((item) => (
          <Card key={item.problem}>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="text-muted-foreground line-through">{item.problem}</p>
              <p className="font-medium">{item.solution}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 text-center">
        <h2 className="text-2xl font-bold">למי זה מתאים</h2>
        <div className="flex flex-wrap justify-center gap-6">
          {AUDIENCE.map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <div className="bg-muted flex size-14 items-center justify-center rounded-full">
                <Icon className="size-6" />
              </div>
              <span className="text-sm">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
        <h2 className="text-center text-2xl font-bold">מחירים</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier) => (
            <Card key={tier.name}>
              <CardContent className="flex flex-col gap-3">
                <div>
                  <p className="font-semibold">{tier.name}</p>
                  <p className="text-muted-foreground text-xs">{tier.tagline}</p>
                </div>
                <p className="text-2xl font-bold">{tier.price}</p>
                <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
                  {tier.features.map((f) => (
                    <li key={f}>✓ {f}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-10">
        <h2 className="text-center text-2xl font-bold">שאלות נפוצות</h2>
        {FAQ.map((item) => (
          <Card key={item.q}>
            <CardContent className="flex flex-col gap-1">
              <p className="font-medium">{item.q}</p>
              <p className="text-muted-foreground text-sm">{item.a}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="flex flex-col items-center gap-4 px-4 py-16 text-center">
        <h2 className="text-2xl font-bold">מוכנים להתחיל?</h2>
        <Button asChild size="lg">
          <Link href="/signup">התחל בחינם — ללא כרטיס אשראי</Link>
        </Button>
      </section>
    </main>
  );
}
