import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Briefcase,
  Brain,
  Building2,
  CalendarCheck2,
  CalendarDays,
  Check,
  Cloud,
  Compass,
  CreditCard,
  Database,
  HandHeart,
  KeyRound,
  Link2,
  Lock,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { BrandMark } from "@/components/brand-mark";
import {
  Board,
  BrowserFrame,
  CheckCard,
  Chips,
  Eyebrow,
  FactList,
  GridPaper,
  Kpi,
  Orbit,
  ScheduleList,
  SidebarRail,
  Steps,
  TrustRow,
} from "@/components/landing";
import { formatPriceIls, planPriceIls, TRIAL_DAYS } from "@/lib/plan";
import { HtmlLangDir } from "@/i18n/client";

// The CSP in src/proxy.ts mints a fresh nonce per request, and a page baked at
// build time cannot carry it — its scripts would be blocked in production only.
// Every other route in this app is already dynamic; these four were the
// exceptions.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cleana+ — יומן וזימון תורים למטפלים/ות עצמאיים/ות",
  description:
    "לינק הזמנה שהמטופלים/ות מבינים במבט, ויומן שלא נכפל לעולם. מסלול אחד, כל היכולות, בלי עמלה על מה שאתם מרוויחים.",
  openGraph: { locale: "he_IL" },
};

/**
 * The single price, from PLAN_PRICE_ILS. Unset, the plan section still reads
 * correctly without a figure — a number invented in code would sit on a public
 * page as a commitment nobody made. Set the variable and it appears here, on the
 * billing screen and in the charge, from the one source.
 */
const PRICE: { amount: string; period: string } | null = (() => {
  const price = planPriceIls();
  return price === null ? null : { amount: formatPriceIls(price, "he"), period: "לחודש, כולל מע\"מ" };
})();

const TRUST = ["בלי כרטיס אשראי", "עולה באוויר בדקות", "ביטול בכל רגע"];

const CHIPS = [
  { icon: Link2, label: "לינק הזמנה" },
  { icon: CalendarDays, label: "יומן" },
  { icon: BellRing, label: "תזכורות" },
  { icon: Users, label: "מטופלים/ות" },
];

/** What the product answers, in the order a practitioner meets it. */
const ANSWERS = [
  {
    title: "לינק אחד. הם מזמינים לבד.",
    text: "המטופלים/ות רואים את השעות שפתחתם ותו לא. בלי הלוך ושוב על יום שלישי, בלי לרדוף בטלפון, בלי להקליד פעמיים.",
  },
  {
    title: "היומן שומר על עצמו.",
    text: "משבצת שנתפסה נסגרת — מיד, בכל מקום. כפל הזמנות מפסיק להיות משהו שצריך לשמור ממנו.",
  },
  {
    title: "תזכורות שלא מציקות.",
    text: "אישור כשהם מזמינים, תזכורת לפני שהם מגיעים. מספיק כדי לצמצם אי-הגעות. לא מספיק כדי להפוך לרעש.",
  },
];

const STEPS = [
  {
    icon: CalendarCheck2,
    title: "קובעים את שעות העבודה",
    text: "חוקים שבועיים, חריגים, מרווח בין מפגשים. היומן מתמלא רק איפה שאמרתם שמותר.",
  },
  {
    icon: Share2,
    title: "משתפים לינק אחד",
    text: "בשם שלכם, בעברית או באנגלית. בוואטסאפ, בביו, בחתימה — איפה שהמטופלים/ות כבר נמצאים.",
  },
  {
    icon: BellRing,
    title: "הם מזמינים. אתם מקבלים הודעה.",
    text: "אישור להם, הודעה לכם, תזכורת לפני שהם מגיעים. היומן שאתם כבר עובדים איתו נשאר מסונכרן.",
  },
];

const AUDIENCE = [
  { icon: Briefcase, label: "אימון" },
  { icon: Brain, label: "פסיכותרפיה" },
  { icon: HandHeart, label: "טיפולי גוף" },
  { icon: Building2, label: "קליניקות פרטיות" },
  { icon: Compass, label: "ייעוץ" },
];

const SECURITY_INCLUDED = [
  "כניסה עם Google או קוד חד-פעמי — אין סיסמאות שידלפו",
  "המידע של כל קליניקה שייך לחשבון שלה בלבד, תמיד",
  "לינקי ההזמנה והניהול נושאים מפתחות פרטיים, לשימוש אחד",
  "פרטי האשראי לא נוגעים ב-Cleana+ — הדף המאובטח של PayPlus גובה",
  "כל אישור ותזכורת נרשמים, כך שאפשר לראות מה נשלח",
  "מוצפן בהעברה, מקצה לקצה",
];

const SECURITY_FACTS = [
  { title: "Clerk", sub: "כניסה וניהול סשנים" },
  { title: "PayPlus", sub: "סליקה בתקן PCI" },
  { title: "HTTPS בכל מקום", sub: "מוצפן בהעברה" },
  { title: "Vercel", sub: "אחסון והגשה" },
];

/**
 * Stated as absences rather than as a feature list, because the argument is
 * that the feature list is the problem.
 */
const OMISSIONS = [
  "אין מסלולים להשוות, ושום דבר לא נעול מאחורי מסלול יקר יותר.",
  "אין תוספות שפותחות את מה שהיה צריך להיות כלול מלכתחילה.",
  "אין עמלה. מה שהמטופלים/ות משלמים לכם — שלכם.",
  "אין לוח מחוונים של מספרים שלא התכוונתם לעשות איתם כלום.",
];

/** What the one plan includes — the pricing card's checklist. */
const INCLUDED = [
  "לינק הזמנה משלכם, בשם שלכם",
  "יומן שלא נכפל לעולם",
  "אישורים ותזכורות במייל, אוטומטית",
  "תזכורות וואטסאפ מהטלפון שלכם, בלחיצה",
  "רשימת מטופלים/ות שנבנית תוך כדי הזמנות",
  "סנכרון ליומני Google, Apple ו-Outlook",
  "עברית ואנגלית, לכם ולמטופלים/ות",
];

const FAQ = [
  {
    q: "אתם לוקחים אחוז ממה שאני גובה?",
    a: "לא. מה שהמטופלים/ות משלמים לכם — שלכם. Cleana+ הוא מנוי קבוע ותו לא.",
  },
  {
    q: "כמה זמן לוקחת ההקמה?",
    a: "דקות. קובעים את שעות העבודה, משתפים את הלינק, ומתחילים לקבל הזמנות.",
  },
  {
    q: "אני כבר עובד/ת עם יומן אחר.",
    a: "מתחברים לפיד של Cleana+ מ-Google Calendar, מיומן האייפון או מ-Outlook, והתורים מופיעים שם לצד כל השאר.",
  },
  {
    q: "מה המטופלים/ות צריכים להתקין?",
    a: "כלום. פותחים לינק, בוחרים שעה ומשאירים פרטים. אין חשבון לפתוח.",
  },
];

const H2 = "font-sans text-3xl font-bold tracking-tight text-balance md:text-4xl lg:text-5xl";

export default function Home() {
  return (
    // Hebrew and right-to-left, for the Israeli practitioner this is written
    // for. The page pins its own direction rather than trusting the layout:
    // the layout follows the signed-in therapist's language, so an English
    // account looking at the landing page would otherwise get it LTR. The
    // wrapper keeps the server render right, and HtmlLangDir corrects
    // <html lang dir> the same way the public booking pages do.
    <div dir="rtl" className="flex flex-1 flex-col">
      <HtmlLangDir locale="he" />
      <header className="border-border/60 bg-background/80 sticky top-0 z-40 border-b backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3.5 md:px-8 lg:px-12">
          <Link href="/" className="inline-flex min-h-11 items-center">
            <BrandMark className="text-foreground text-xl" />
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/signup" className="text-muted-foreground hover:text-foreground hidden min-h-11 items-center font-medium sm:inline-flex">
              הרשמה
            </Link>
            <Button asChild size="lg" className="rounded-2xl px-6 font-semibold">
              <Link href="/login">כניסה</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <GridPaper />
          <div aria-hidden className="bg-accent/15 pointer-events-none absolute -top-32 left-1/2 hidden h-96 w-[36rem] -translate-x-1/2 rounded-full blur-3xl md:block" />
          <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-7 px-5 pt-16 pb-10 text-center md:px-8 md:pt-24">
            <Eyebrow icon={Sparkles}>זימון תורים למטפלים/ות עצמאיים/ות</Eyebrow>
            <h1 className="font-sans text-[2.6rem] leading-[1.05] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              פחות הלוך ושוב.
              <br />
              <span className="text-primary">יותר טיפול.</span>
            </h1>
            <p className="text-muted-foreground max-w-xl text-lg leading-relaxed">
              לינק הזמנה שהמטופלים/ות מבינים במבט, ויומן שלא נכפל לעולם.
              זה כל המוצר, וזה מספיק.
            </p>
            <div className="flex w-full max-w-md flex-col gap-3">
              <Button asChild size="lg" variant="accent" className="h-14 w-full rounded-2xl text-base font-semibold shadow-lg shadow-accent/25">
                <Link href="/signup">
                  ליצור את לינק ההזמנה שלי
                  <ArrowRight className="size-5 rtl:rotate-180" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-14 w-full rounded-2xl text-base font-semibold">
                <Link href="#how-it-works">איך זה עובד</Link>
              </Button>
            </div>
            <TrustRow items={TRUST} />
            <div className="border-border/60 bg-card inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border px-6 py-3 text-sm shadow-sm">
              <span className="text-accent" aria-hidden>★★★★★</span>
              <span>
                <strong>{TRIAL_DAYS} הימים הראשונים בחינם</strong> · מסלול אחד · בלי עמלה
              </span>
            </div>
          </div>

          {/* The product, as a window */}
          <div className="relative mx-auto w-full max-w-4xl px-5 pb-16 md:px-8 md:pb-24">
            <BrowserFrame>
              <div className="flex">
                <SidebarRail />
                <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
                  <div className="flex flex-col gap-2">
                    <span className="bg-foreground/85 h-3 w-40 rounded-full" />
                    <span className="bg-border h-2.5 w-56 rounded-full" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Kpi label="השבוע" value="28" delta="+12%" />
                    <Kpi label="מטופלים/ות" value="64" delta="+5" />
                    <Kpi label="אי-הגעות" value="1" delta="−3" />
                  </div>
                  <ScheduleList
                    title="היום"
                    meta="ראשון, 19 באפריל"
                    rows={[
                      { time: "09:00", name: "נועה לוי", status: "מאושר", tone: "open" },
                      { time: "10:30", name: "דן ארי", status: "ממתין", tone: "held" },
                      { time: "12:00", name: "מאיה כהן", status: "בקרוב", tone: "booked" },
                    ]}
                  />
                </div>
              </div>
            </BrowserFrame>
          </div>
        </section>

        {/* Areas */}
        <section className="mx-auto w-full max-w-4xl px-5 md:px-8">
          <Chips items={CHIPS} />
        </section>

        {/* Answers */}
        <section className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 px-5 py-16 md:grid-cols-3 md:gap-6 md:px-8 md:py-24">
          {ANSWERS.map((answer, i) => (
            <div key={answer.title} className="border-border/60 bg-card flex flex-col gap-3 rounded-3xl border p-6 shadow-sm md:p-7">
              <span className="num text-primary text-2xl font-bold">{String(i + 1).padStart(2, "0")}</span>
              <p className="text-lg font-bold">{answer.title}</p>
              <p className="text-muted-foreground text-sm leading-relaxed">{answer.text}</p>
            </div>
          ))}
        </section>

        {/* Board */}
        <section className="relative overflow-hidden">
          <GridPaper />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2 md:px-8 md:py-24">
            <div className="flex flex-col gap-5 text-center md:text-start">
              <Eyebrow icon={CalendarDays}>השבוע במבט אחד</Eyebrow>
              <h2 className={H2}>
                פנוי, ממתין, מוזמן. <span className="text-primary">אין מה עוד לעקוב.</span>
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed">
                כל משבצת היא אחד משלושה דברים. הזמנה מזיזה אותה על הלוח לבד, וביטול מחזיר אותה.
              </p>
            </div>
            <Board
              title="השבוע שלך"
              badge="6 הזמנות השבוע"
              columns={[
                {
                  title: "פנוי",
                  tone: "open",
                  cards: [
                    { title: "א׳ 16:00", sub: "60 דק׳" },
                    { title: "ב׳ 09:00", sub: "60 דק׳" },
                  ],
                  placeholders: 1,
                },
                { title: "ממתין", tone: "held", cards: [{ title: "דן ארי", sub: "ג׳ 10:30" }], placeholders: 1 },
                {
                  title: "מוזמן",
                  tone: "booked",
                  cards: [
                    { title: "נועה לוי", sub: "א׳ 09:00" },
                    { title: "מאיה כהן", sub: "א׳ 12:00" },
                    { title: "יעל שפירא", sub: "ד׳ 17:00" },
                  ],
                },
              ]}
            />
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-border/60 border-t">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-16 md:px-8 md:py-24">
            <div className="flex flex-col items-center gap-4 text-center">
              <Eyebrow icon={Check}>איך זה עובד</Eyebrow>
              <h2 className={H2}>
                שלושה שלבים. <span className="text-primary">ומשם זה רץ לבד.</span>
              </h2>
            </div>
            <Steps steps={STEPS} />
          </div>
        </section>

        {/* Audience */}
        <section className="border-border/60 border-t">
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-10 px-5 py-16 text-center md:px-8 md:py-24">
            <h2 className={H2}>בנוי למטפל/ת אחד/ת והיומן שלו/ה</h2>
            <div className="flex flex-wrap justify-center gap-x-10 gap-y-8">
              {AUDIENCE.map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-3">
                  <div className="bg-card border-border/60 flex size-16 items-center justify-center rounded-2xl border shadow-sm">
                    <Icon className="text-primary size-6" strokeWidth={1.75} />
                  </div>
                  <span className="text-sm font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Security */}
        <section className="border-border/60 relative overflow-hidden border-t">
          <GridPaper />
          <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-12 px-5 py-16 md:px-8 md:py-24">
            <div className="flex flex-col items-center gap-4 text-center">
              <Eyebrow icon={ShieldCheck}>אבטחה ופרטיות</Eyebrow>
              <h2 className={H2}>
                הפרטים של המטופלים/ות שלכם. <span className="text-primary">נשארים אצלכם.</span>
              </h2>
              <p className="text-muted-foreground max-w-xl text-lg leading-relaxed">
                אנחנו יודעים כמה אישית רשימת מטופלים/ות. לכן היסודות בנויים באותה רמה כמו כל השאר כאן:
                פחות חלקים נעים, וכל אחד מהם מתועד.
              </p>
            </div>
            <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2">
              <Orbit center={ShieldCheck} satellites={[Lock, KeyRound, Database, Cloud]} />
              <div className="flex flex-col gap-6">
                <CheckCard title="מה כלול" items={SECURITY_INCLUDED} />
                <FactList facts={SECURITY_FACTS} />
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="border-border/60 relative overflow-hidden border-t">
          <div aria-hidden className="bg-accent/15 pointer-events-none absolute -bottom-40 left-1/2 hidden h-[28rem] w-[44rem] -translate-x-1/2 rounded-full blur-3xl md:block" />
          <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-5 py-16 md:px-8 md:py-24">
            <div className="flex flex-col items-center gap-4 text-center">
              <Eyebrow icon={CreditCard}>המסלול</Eyebrow>
              <h2 className={H2}>
                מסלול אחד. <span className="text-primary">הכול בפנים.</span>
              </h2>
              <p className="text-muted-foreground max-w-lg text-lg leading-relaxed">
                אתם לא משלמים על ערימת יכולות שלעולם לא תפתחו. יש גרסה אחת של Cleana+, כל מטפל/ת מקבל/ת
                את כולה, והמחיר לא זז כשהקליניקה שלכם גדלה.
              </p>
            </div>

            <div className="border-primary/25 bg-card shadow-primary/10 relative w-full max-w-3xl overflow-hidden rounded-3xl border shadow-2xl">
              <div aria-hidden className="from-primary via-accent to-primary absolute inset-x-0 top-0 h-1 bg-gradient-to-r" />
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                <div className="border-border/60 flex flex-col items-center justify-center gap-5 border-b px-6 py-10 text-center md:items-start md:border-e md:border-b-0 md:px-10 md:text-start">
                  <span className="bg-st-open-bg/70 text-st-open border-st-open/35 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold">
                    <Check className="size-3.5" aria-hidden />
                    {TRIAL_DAYS} הימים הראשונים בחינם · בלי כרטיס
                  </span>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-sm font-medium">Cleana+</span>
                    {PRICE ? (
                      <p className="flex flex-wrap items-baseline justify-center gap-x-2 md:justify-start">
                        <span className="num text-5xl font-extrabold tracking-tight md:text-6xl">{PRICE.amount}</span>
                        <span className="text-muted-foreground text-sm">{PRICE.period}</span>
                      </p>
                    ) : (
                      <p className="text-muted-foreground text-sm">המחיר יפורסם בקרוב</p>
                    )}
                  </div>
                  <p className="text-muted-foreground max-w-xs text-sm leading-relaxed">
                    תשלום חודשי אחד אחרי החודש החינמי. אפשר לעצור בכל רגע מהדשבורד — בלי שיחה,
                    בלי טופס.
                  </p>
                  <Button asChild size="lg" variant="accent" className="h-12 w-full rounded-2xl font-semibold md:w-auto">
                    <Link href="/signup">
                      להתחיל חודש חינם
                      <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
                    </Link>
                  </Button>
                </div>

                <ul className="flex flex-col gap-3 px-6 py-10 md:px-10">
                  {INCLUDED.map((line) => (
                    <li key={line} className="flex items-start gap-3 text-sm leading-relaxed">
                      <span className="bg-st-open-bg text-st-open mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full">
                        <Check className="size-3" strokeWidth={3} aria-hidden />
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <ul className="mx-auto flex max-w-xl flex-col gap-3">
              {OMISSIONS.map((line) => (
                <li key={line} className="border-border/60 text-muted-foreground border-t pt-3 text-center text-sm leading-relaxed first:border-t-0 first:pt-0">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-border/60 border-t">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-16 md:px-8 md:py-24">
            <h2 className={cn(H2, "text-center")}>שאלות</h2>
            <div className="flex flex-col gap-3">
              {FAQ.map((item) => (
                <div key={item.q} className="border-border/60 bg-card rounded-2xl border p-5 shadow-sm md:p-6">
                  <p className="font-bold">{item.q}</p>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-border/60 relative overflow-hidden border-t">
          <GridPaper />
          <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-5 py-16 text-center md:px-8 md:py-24">
            <h2 className={H2}>
              קבלו את <span className="text-primary">ההזמנה הראשונה</span>
            </h2>
            <p className="text-muted-foreground max-w-md text-lg leading-relaxed">
              קובעים את שעות העבודה ומשתפים לינק אחד. כל השאר כבר מוכן.
            </p>
            <Button asChild size="lg" variant="accent" className="h-14 w-full max-w-md rounded-2xl text-base font-semibold shadow-lg shadow-accent/25">
              <Link href="/signup">
                ליצור את לינק ההזמנה שלי
                <ArrowRight className="size-5 rtl:rotate-180" aria-hidden />
              </Link>
            </Button>
            <TrustRow items={TRUST} />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
