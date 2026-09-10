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

// The CSP in src/proxy.ts mints a fresh nonce per request, and a page baked at
// build time cannot carry it — its scripts would be blocked in production only.
// Every other route in this app is already dynamic; these four were the
// exceptions.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cleana+ — scheduling for independent practitioners",
  description:
    "A booking link your clients understand at a glance, and a calendar that never double-books. One plan, every feature, no commission on what you earn.",
};

/**
 * The single price, from PLAN_PRICE_ILS. Unset, the plan section still reads
 * correctly without a figure — a number invented in code would sit on a public
 * page as a commitment nobody made. Set the variable and it appears here, on the
 * billing screen and in the charge, from the one source.
 */
const PRICE: { amount: string; period: string } | null = (() => {
  const price = planPriceIls();
  return price === null ? null : { amount: formatPriceIls(price, "en"), period: "month, VAT included" };
})();

const TRUST = ["No card required", "Live in minutes", "Cancel any time"];

const CHIPS = [
  { icon: Link2, label: "Booking link" },
  { icon: CalendarDays, label: "Calendar" },
  { icon: BellRing, label: "Reminders" },
  { icon: Users, label: "Clients" },
];

/** What the product answers, in the order a practitioner meets it. */
const ANSWERS = [
  {
    title: "One link. They book themselves.",
    text: "Clients see the hours you opened and nothing else. No back-and-forth about Tuesday, no phone tag, no double entry.",
  },
  {
    title: "The calendar holds itself.",
    text: "A slot taken is a slot closed — instantly, everywhere. Double-booking stops being something you watch for.",
  },
  {
    title: "Reminders that stay quiet.",
    text: "A confirmation when they book, a reminder before they arrive. Enough to cut no-shows. Not enough to become noise.",
  },
];

const STEPS = [
  {
    icon: CalendarCheck2,
    title: "Set the hours you work",
    text: "Weekly rules, exceptions, a buffer between sessions. Your calendar fills only where you said it may.",
  },
  {
    icon: Share2,
    title: "Share one link",
    text: "In your name, in Hebrew or English. Put it in WhatsApp, your bio, your signature — wherever clients already are.",
  },
  {
    icon: BellRing,
    title: "They book. You get told.",
    text: "A confirmation for them, a note for you, a reminder before they arrive. The calendar you already use stays in sync.",
  },
];

const AUDIENCE = [
  { icon: Briefcase, label: "Coaching" },
  { icon: Brain, label: "Psychotherapy" },
  { icon: HandHeart, label: "Bodywork" },
  { icon: Building2, label: "Private clinics" },
  { icon: Compass, label: "Consulting" },
];

const SECURITY_INCLUDED = [
  "Sign-in with Google or a one-time code — no passwords to leak",
  "Every practice's data scoped to its own account, always",
  "Booking and manage links carry private, single-purpose tokens",
  "Card details never touch Cleana+ — PayPlus's secure page takes payment",
  "Every confirmation and reminder logged, so you can see what was sent",
  "Encrypted in transit, end to end",
];

const SECURITY_FACTS = [
  { title: "Clerk", sub: "Sign-in and sessions" },
  { title: "PayPlus", sub: "PCI-compliant payments" },
  { title: "HTTPS everywhere", sub: "Encrypted in transit" },
  { title: "Vercel", sub: "Hosting and delivery" },
];

/**
 * Stated as absences rather than as a feature list, because the argument is
 * that the feature list is the problem.
 */
const OMISSIONS = [
  "No tiers to compare, and nothing held back behind a higher one.",
  "No add-ons that unlock what should have been included.",
  "No commission. What your clients pay you is yours.",
  "No dashboard of numbers you were never going to act on.",
];

/** What the one plan includes — the pricing card's checklist. */
const INCLUDED = [
  "Your own booking link, in your name",
  "A calendar that never double-books",
  "Email confirmations and reminders, automatic",
  "WhatsApp reminders from your own phone, one tap",
  "Client list, built as they book",
  "Syncs to Google, Apple and Outlook calendars",
  "Hebrew and English, for you and for your clients",
];

const FAQ = [
  {
    q: "Do you take a cut of what I charge?",
    a: "No. What your clients pay you is yours. Cleana+ is a flat subscription and nothing else.",
  },
  {
    q: "How long does it take to set up?",
    a: "Minutes. Set the hours you work, share your link, and you are taking bookings.",
  },
  {
    q: "I already live in another calendar.",
    a: "Subscribe to your Cleana+ feed from Google Calendar, the iPhone calendar or Outlook, and your appointments appear there alongside everything else.",
  },
  {
    q: "What do my clients have to install?",
    a: "Nothing. They open a link, pick a time, and leave their details. There is no account to create.",
  },
];

const H2 = "font-sans text-3xl font-bold tracking-tight text-balance md:text-4xl lg:text-5xl";

export default function Home() {
  return (
    // The app is Hebrew and right-to-left; this one page is not.
    <div dir="ltr" className="flex flex-1 flex-col">
      <header className="border-border/60 bg-background/80 sticky top-0 z-40 border-b backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3.5 md:px-8 lg:px-12">
          <Link href="/" className="inline-flex min-h-11 items-center">
            <BrandMark className="text-foreground text-xl" />
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/signup" className="text-muted-foreground hover:text-foreground hidden min-h-11 items-center font-medium sm:inline-flex">
              Sign up
            </Link>
            <Button asChild size="lg" className="rounded-2xl px-6 font-semibold">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <GridPaper />
          <div aria-hidden className="bg-accent/15 pointer-events-none absolute -top-32 start-1/2 hidden h-96 w-[36rem] -translate-x-1/2 rounded-full blur-3xl md:block" />
          <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-7 px-5 pt-16 pb-10 text-center md:px-8 md:pt-24">
            <Eyebrow icon={Sparkles}>Scheduling for independent practitioners</Eyebrow>
            <h1 className="font-sans text-[2.6rem] leading-[1.05] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Less back-and-forth.
              <br />
              <span className="text-primary">More practice.</span>
            </h1>
            <p className="text-muted-foreground max-w-xl text-lg leading-relaxed">
              A booking link your clients understand at a glance, and a calendar that never double-books.
              That is the whole product, and it is enough.
            </p>
            <div className="flex w-full max-w-md flex-col gap-3">
              <Button asChild size="lg" variant="accent" className="h-14 w-full rounded-2xl text-base font-semibold shadow-lg shadow-accent/25">
                <Link href="/signup">
                  Create your booking link
                  <ArrowRight className="size-5" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-14 w-full rounded-2xl text-base font-semibold">
                <Link href="#how-it-works">See how it works</Link>
              </Button>
            </div>
            <TrustRow items={TRUST} />
            <div className="border-border/60 bg-card inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border px-6 py-3 text-sm shadow-sm">
              <span className="text-accent" aria-hidden>★★★★★</span>
              <span>
                <strong>First {TRIAL_DAYS} days free</strong> · one plan · no commission
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
                    <Kpi label="This week" value="28" delta="+12%" />
                    <Kpi label="Clients" value="64" delta="+5" />
                    <Kpi label="No-shows" value="1" delta="−3" />
                  </div>
                  <ScheduleList
                    title="Today"
                    meta="Sunday, 19 Apr"
                    rows={[
                      { time: "09:00", name: "Noa Levi", status: "Confirmed", tone: "open" },
                      { time: "10:30", name: "Dan Ari", status: "Pending", tone: "held" },
                      { time: "12:00", name: "Maya Cohen", status: "Upcoming", tone: "booked" },
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
              <Eyebrow icon={CalendarDays}>The week at a glance</Eyebrow>
              <h2 className={H2}>
                Open, pending, booked. <span className="text-primary">Nothing else to track.</span>
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Every slot is one of three things. A booking moves it across the board by itself, and a
                cancellation moves it back.
              </p>
            </div>
            <Board
              title="Your week"
              badge="6 booked this week"
              columns={[
                {
                  title: "Open",
                  tone: "open",
                  cards: [
                    { title: "Sun 16:00", sub: "60 min" },
                    { title: "Mon 09:00", sub: "60 min" },
                  ],
                  placeholders: 1,
                },
                { title: "Pending", tone: "held", cards: [{ title: "Dan Ari", sub: "Tue 10:30" }], placeholders: 1 },
                {
                  title: "Booked",
                  tone: "booked",
                  cards: [
                    { title: "Noa Levi", sub: "Sun 09:00" },
                    { title: "Maya Cohen", sub: "Sun 12:00" },
                    { title: "Yael Shapira", sub: "Wed 17:00" },
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
              <Eyebrow icon={Check}>How it works</Eyebrow>
              <h2 className={H2}>
                Three steps. <span className="text-primary">Then it runs itself.</span>
              </h2>
            </div>
            <Steps steps={STEPS} />
          </div>
        </section>

        {/* Audience */}
        <section className="border-border/60 border-t">
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-10 px-5 py-16 text-center md:px-8 md:py-24">
            <h2 className={H2}>Built for one practitioner and their calendar</h2>
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
              <Eyebrow icon={ShieldCheck}>Security &amp; privacy</Eyebrow>
              <h2 className={H2}>
                Your clients&rsquo; details. <span className="text-primary">Kept to yourself.</span>
              </h2>
              <p className="text-muted-foreground max-w-xl text-lg leading-relaxed">
                We know how personal a client list is. So the foundations are built to the same standard as
                everything else here: fewer moving parts, and each one accounted for.
              </p>
            </div>
            <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2">
              <Orbit center={ShieldCheck} satellites={[Lock, KeyRound, Database, Cloud]} />
              <div className="flex flex-col gap-6">
                <CheckCard title="What's included" items={SECURITY_INCLUDED} />
                <FactList facts={SECURITY_FACTS} />
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="border-border/60 relative overflow-hidden border-t">
          <div aria-hidden className="bg-accent/15 pointer-events-none absolute -bottom-40 start-1/2 hidden h-[28rem] w-[44rem] -translate-x-1/2 rounded-full blur-3xl md:block" />
          <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-5 py-16 md:px-8 md:py-24">
            <div className="flex flex-col items-center gap-4 text-center">
              <Eyebrow icon={CreditCard}>The plan</Eyebrow>
              <h2 className={H2}>
                One plan. <span className="text-primary">Everything in it.</span>
              </h2>
              <p className="text-muted-foreground max-w-lg text-lg leading-relaxed">
                You are not paying for a pile of features you will never open. There is one version of Cleana+,
                every practitioner has all of it, and the price does not move as your practice does.
              </p>
            </div>

            <div className="border-primary/25 bg-card shadow-primary/10 relative w-full max-w-3xl overflow-hidden rounded-3xl border shadow-2xl">
              <div aria-hidden className="from-primary via-accent to-primary absolute inset-x-0 top-0 h-1 bg-gradient-to-r" />
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                <div className="border-border/60 flex flex-col items-center justify-center gap-5 border-b px-6 py-10 text-center md:items-start md:border-e md:border-b-0 md:px-10 md:text-start">
                  <span className="bg-st-open-bg/70 text-st-open border-st-open/35 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold">
                    <Check className="size-3.5" aria-hidden />
                    First {TRIAL_DAYS} days free · no card
                  </span>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-sm font-medium">Cleana+</span>
                    {PRICE ? (
                      <p className="flex flex-wrap items-baseline justify-center gap-x-2 md:justify-start">
                        <span className="num text-5xl font-extrabold tracking-tight md:text-6xl">{PRICE.amount}</span>
                        <span className="text-muted-foreground text-sm">/ {PRICE.period}</span>
                      </p>
                    ) : (
                      <p className="text-muted-foreground text-sm">Price coming soon</p>
                    )}
                  </div>
                  <p className="text-muted-foreground max-w-xs text-sm leading-relaxed">
                    One monthly payment after your free month. Stop it any time from your dashboard — no call,
                    no form.
                  </p>
                  <Button asChild size="lg" variant="accent" className="h-12 w-full rounded-2xl font-semibold md:w-auto">
                    <Link href="/signup">
                      Start your free month
                      <ArrowRight className="size-4" aria-hidden />
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
            <h2 className={cn(H2, "text-center")}>Questions</h2>
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
              Take your <span className="text-primary">first booking</span>
            </h2>
            <p className="text-muted-foreground max-w-md text-lg leading-relaxed">
              Set the hours you work and share one link. The rest is already done.
            </p>
            <Button asChild size="lg" variant="accent" className="h-14 w-full max-w-md rounded-2xl text-base font-semibold shadow-lg shadow-accent/25">
              <Link href="/signup">
                Create your booking link
                <ArrowRight className="size-5" aria-hidden />
              </Link>
            </Button>
            <TrustRow items={TRUST} />
          </div>
        </section>
      </main>

      <SiteFooter english />
    </div>
  );
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
