import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Brain, HandHeart, Building2, Compass, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SiteFooter } from "@/components/site-footer";
import { BrandMark } from "@/components/brand-mark";

export const metadata: Metadata = {
  title: "Cleana+ — תוכנה לניהול תורים למטפלים",
  description:
    "תוכנה לניהול תורים למטפלים, מאמנים ובעלי מקצוע עצמאיים. קישור אישי, הלקוחות מזמינים בעצמם, ללא תורים כפולים. התחילו בחינם ללא כרטיס אשראי.",
};

const STEPS = [
  {
    title: "חוויית לקוח חלקה",
    text: "במקום התכתבויות ארוכות, הלקוחות מקבלים גישה ליומן חכם שמותאם לזמנים שהגדרת מראש.",
  },
  {
    title: "סנכרון מוחלט",
    text: "המערכת מונעת חפיפות באופן הרמטי. כל פגישה שנקבעת מעדכנת את היומן שלך בזמן אמת.",
  },
  {
    title: "תקשורת שקטה",
    text: "תזכורות אוטומטיות ועדינות נשלחות ללקוח, ומפחיתות משמעותית ביטולים או איחורים.",
  },
];

const AUDIENCE = [
  { icon: Briefcase, label: "קאוצ'ינג" },
  { icon: Brain, label: "פסיכותרפיה" },
  { icon: HandHeart, label: "טיפולי מגע" },
  { icon: Building2, label: "קליניקות פרטיות" },
  { icon: Compass, label: "ייעוץ והכוונה" },
];

const TIERS = [
  {
    name: "Free",
    tagline: "התנסות",
    price: "₪0",
    features: ["5 חלונות טיפול", "15 הזמנות בחודש", "עמוד נחיתה אישי"],
  },
  {
    name: "Basic",
    tagline: "לקליניקה בתחילת דרכה",
    price: "₪39",
    features: ["ללא הגבלת הזמנות", "תזכורות במייל", "סנכרון יומנים"],
  },
  {
    name: "Pro",
    tagline: "לקליניקה הפעילה",
    price: "₪89",
    features: ["תזכורות SMS", "מיתוג אישי נקי", "ניתוח נתונים"],
    featured: true,
  },
  {
    name: "Business",
    tagline: "מרכז מטפלים",
    price: "₪189",
    features: ["דומיין מותאם אישית", "תמיכת פרימיום", "ניהול מספר יומנים במקביל"],
  },
];

const FAQ = [
  {
    q: "האם יש עמלות על תשלומים מהלקוחות שלי?",
    a: "לא. Cleana+ בנויה על מודל מנוי חודשי קבוע. אנחנו לעולם לא גוזרים עמלה מההכנסות שלך.",
  },
  {
    q: "האם נדרש כרטיס אשראי לתקופת הניסיון?",
    a: "בהחלט לא. מסלול ההתנסות שלנו פתוח לחלוטין.",
  },
  {
    q: "כמה זמן לוקח להקים את היומן?",
    a: "תהליך ההגדרה הראשוני לוקח דקות בודדות.",
  },
];

export default function Home() {
  return (
    <>
      <header className="border-border/60 sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 md:px-8 lg:px-12">
          <Link href="/" className="inline-flex min-h-11 items-center">
            <BrandMark className="text-foreground text-lg" />
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/signup" className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center">
              הרשמה
            </Link>
            <Link href="/login" className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center">
              התחברות
            </Link>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="bg-accent/15 pointer-events-none absolute -top-32 start-1/2 hidden h-96 w-[36rem] -translate-x-1/2 rounded-full blur-3xl md:block"
          />
          <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6 px-5 py-16 text-center md:px-8 md:py-24 lg:py-32">
            <span className="kicker">ניהול יומן לקליניקות בוטיק</span>
            <h1 className="text-4xl font-light text-balance md:text-5xl lg:text-6xl">
              סטנדרט חדש של תיאום פגישות.
            </h1>
            <p className="text-muted-foreground max-w-md text-base leading-relaxed md:text-lg">
              חוויית שירות שמתחילה עוד לפני הפגישה. קישור הרשמה אלגנטי אחד שמאפשר ללקוחות שלך
              לתאם בעצמם, בזמן שהיומן שלך מתנהל בשקט וביעילות.
            </p>
            <div className="flex flex-col items-center gap-3 pt-2">
              <Button asChild size="lg" variant="accent" className="font-medium">
                <Link href="/signup">יצירת קישור אישי</Link>
              </Button>
              <p className="text-muted-foreground text-xs">התנסות ללא עלות. אין צורך באשראי.</p>
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-5 py-16 md:grid-cols-2 md:gap-8 md:px-8 md:py-24 lg:grid-cols-3 lg:gap-12 lg:py-32">
          {STEPS.map((step, i) => (
            <div key={step.title} className="flex flex-col gap-3">
              <span className="font-heading text-accent text-2xl font-normal">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="font-medium">{step.title}</p>
              <p className="text-muted-foreground text-sm leading-relaxed">{step.text}</p>
            </div>
          ))}
        </section>

        <section className="border-border/60 border-t">
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-10 px-5 py-16 text-center md:px-8 md:py-24 lg:py-32">
            <h2 className="text-3xl font-normal md:text-4xl lg:text-5xl">מעטפת מושלמת למקצועות הטיפול</h2>
            <div className="flex flex-wrap justify-center gap-x-10 gap-y-8">
              {AUDIENCE.map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-3">
                  <div className="bg-primary/6 border-primary/15 flex size-14 items-center justify-center rounded-full border">
                    <Icon className="text-primary size-5" strokeWidth={1.5} />
                  </div>
                  <span className="text-sm">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-border/60 border-t">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-5 py-16 md:px-8 md:py-24 lg:py-32">
            <h2 className="text-center text-3xl font-normal md:text-4xl lg:text-5xl">מסלולים שגדלים יחד איתך</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8 lg:grid-cols-4 lg:gap-8">
              {TIERS.map((tier) => (
                <Card
                  key={tier.name}
                  className={
                    tier.featured
                      ? "border-primary/30 shadow-none"
                      : "border-border/60 shadow-none"
                  }
                >
                  <CardContent className="flex h-full flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      {tier.featured && (
                        <span className="text-accent text-xs font-medium">מומלץ</span>
                      )}
                      <p className="font-heading text-lg font-normal">{tier.name}</p>
                      <p className="text-muted-foreground text-xs">{tier.tagline}</p>
                    </div>
                    <p className="num text-2xl font-medium">
                      {tier.price}
                      <span className="text-muted-foreground text-sm font-normal">/חודש</span>
                    </p>
                    <ul className="text-muted-foreground flex flex-col gap-2 text-sm">
                      {tier.features.map((f) => (
                        <li key={f} className="flex items-center gap-2">
                          <Check className="text-primary size-4 shrink-0" strokeWidth={2} />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-border/60 border-t">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-16 md:px-8 md:py-24 lg:py-32">
            <h2 className="text-center text-3xl font-normal md:text-4xl lg:text-5xl">שאלות נפוצות</h2>
            <div className="flex flex-col gap-6">
              {FAQ.map((item) => (
                <div key={item.q} className="border-border/60 border-t pt-6 first:border-t-0 first:pt-0">
                  <p className="font-medium">{item.q}</p>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-border/60 border-t">
          <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5 px-5 py-16 text-center md:px-8 md:py-24 lg:py-32">
            <h2 className="text-3xl font-normal md:text-4xl lg:text-5xl">מוכנים להתחיל?</h2>
            <p className="text-muted-foreground max-w-md text-base leading-relaxed md:text-lg">
              הקמת הקישור האישי שלך לוקחת פחות מ-3 דקות.
            </p>
            <Button asChild size="lg" variant="accent" className="font-medium">
              <Link href="/signup">יצירת קישור אישי</Link>
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
