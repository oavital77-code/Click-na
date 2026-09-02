import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, HandHeart, Dumbbell, GraduationCap, Stethoscope, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SiteFooter } from "@/components/site-footer";

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
  { name: "Pro", price: "$25/חודש", tagline: "הכי פופולרי", features: ["תזכורות SMS", "מיתוג אישי", "דוחות ואנליטיקס"], featured: true },
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
    <>
      <main className="flex flex-1 flex-col">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="bg-accent/25 pointer-events-none absolute -top-32 start-1/2 h-96 w-[36rem] -translate-x-1/2 rounded-full blur-3xl"
          />
          <div
            aria-hidden
            className="bg-primary/10 pointer-events-none absolute top-20 end-0 h-72 w-72 rounded-full blur-3xl"
          />
          <div className="relative flex flex-col items-center gap-6 px-4 py-20 text-center sm:py-28">
            <span className="kicker">ניהול תורים לבעלי מקצוע עצמאיים</span>
            <h1 className="max-w-3xl text-4xl text-balance sm:text-5xl md:text-6xl">
              תפסיקו לתאם תורים בווטסאפ
            </h1>
            <p className="text-muted-foreground max-w-md text-lg">
              קישור אישי אחד — הלקוחות שלך משבצים את עצמם, והיומן מתנהל לבד. בלי תורים כפולים, בלי
              עשרות הודעות &ldquo;מתי אתה פנוי?&rdquo;.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button asChild size="lg" variant="accent" className="font-semibold">
                <Link href="/signup">התחל בחינם — ללא כרטיס אשראי</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">כבר יש לך חשבון? התחבר</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-10 sm:grid-cols-3">
          {PROBLEM_SOLUTION.map((item, i) => (
            <Card key={item.problem} className="border-border/60">
              <CardContent className="flex flex-col gap-3">
                <span className="font-heading text-accent text-2xl">{String(i + 1).padStart(2, "0")}</span>
                <p className="text-muted-foreground text-sm line-through decoration-1">{item.problem}</p>
                <p className="font-medium">{item.solution}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-14 text-center">
          <h2 className="text-3xl">למי זה מתאים</h2>
          <div className="flex flex-wrap justify-center gap-8">
            {AUDIENCE.map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-3">
                <div className="bg-primary/8 border-primary/15 flex size-16 items-center justify-center rounded-full border">
                  <Icon className="text-primary size-6" strokeWidth={1.5} />
                </div>
                <span className="text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-14">
          <h2 className="text-center text-3xl">מחירים</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TIERS.map((tier) => (
              <Card
                key={tier.name}
                className={
                  tier.featured
                    ? "border-primary ring-primary/15 relative ring-2"
                    : "border-border/60"
                }
              >
                <CardContent className="flex h-full flex-col gap-3">
                  {tier.featured && (
                    <span className="bg-accent text-accent-foreground absolute -top-3 start-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold">
                      הכי פופולרי
                    </span>
                  )}
                  <div>
                    <p className="font-heading text-lg font-medium">{tier.name}</p>
                    <p className="text-muted-foreground text-xs">{tier.tagline}</p>
                  </div>
                  <p className="num text-2xl font-bold">{tier.price}</p>
                  <ul className="text-muted-foreground flex flex-col gap-1.5 text-sm">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <Check className="text-primary size-4 shrink-0" strokeWidth={2.5} />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-14">
          <h2 className="text-center text-3xl">שאלות נפוצות</h2>
          {FAQ.map((item) => (
            <Card key={item.q} className="border-border/60">
              <CardContent className="flex flex-col gap-1">
                <p className="font-medium">{item.q}</p>
                <p className="text-muted-foreground text-sm">{item.a}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="bg-primary text-primary-foreground mt-10 flex flex-col items-center gap-5 px-4 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl">מוכנים להתחיל?</h2>
          <p className="max-w-md text-sm opacity-80">
            הקמת הקישור האישי שלך לוקחת פחות מ-3 דקות.
          </p>
          <Button asChild size="lg" variant="accent" className="font-semibold">
            <Link href="/signup">התחל בחינם — ללא כרטיס אשראי</Link>
          </Button>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
