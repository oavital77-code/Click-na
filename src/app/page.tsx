import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Brain, HandHeart, Building2, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { BrandMark } from "@/components/brand-mark";

export const metadata: Metadata = {
  title: "Cleana+ — scheduling for independent practitioners",
  description:
    "A booking link your clients understand at a glance, and a calendar that never double-books. One plan, every feature, no commission on what you earn.",
};

/**
 * The single price. Left unset deliberately: the plan section reads correctly
 * without a figure, and a number invented here would sit on a public page as a
 * commitment nobody made. Set it and it appears.
 */
const PRICE: { amount: string; period: string } | null = null;

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

const AUDIENCE = [
  { icon: Briefcase, label: "Coaching" },
  { icon: Brain, label: "Psychotherapy" },
  { icon: HandHeart, label: "Bodywork" },
  { icon: Building2, label: "Private clinics" },
  { icon: Compass, label: "Consulting" },
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

export default function Home() {
  return (
    // The app is Hebrew and right-to-left; this one page is not.
    <div dir="ltr" className="flex flex-1 flex-col">
      <header className="border-border/60 bg-background/80 sticky top-0 z-40 border-b backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 md:px-8 lg:px-12">
          <Link href="/" className="inline-flex min-h-11 items-center">
            <BrandMark className="text-foreground text-lg" />
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/signup"
              className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center"
            >
              Sign up
            </Link>
            <Link
              href="/login"
              className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center"
            >
              Log in
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
            <span className="kicker">Scheduling for independent practitioners</span>
            <h1 className="text-4xl font-light text-balance md:text-5xl lg:text-6xl">
              Simplicity wins.
            </h1>
            <p className="text-muted-foreground max-w-md text-base leading-relaxed md:text-lg">
              A booking link your clients understand at a glance, and a calendar that never
              double-books. That is the whole product, and it is enough.
            </p>
            <div className="flex flex-col items-center gap-3 pt-2">
              <Button asChild size="lg" variant="accent" className="font-medium">
                <Link href="/signup">Create your booking link</Link>
              </Button>
              <p className="text-muted-foreground text-xs">Free to try. No card required.</p>
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-5 py-16 md:grid-cols-2 md:gap-8 md:px-8 md:py-24 lg:grid-cols-3 lg:gap-12 lg:py-32">
          {ANSWERS.map((answer, i) => (
            <div key={answer.title} className="flex flex-col gap-3">
              <span className="font-heading text-accent text-2xl font-normal">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="font-medium">{answer.title}</p>
              <p className="text-muted-foreground text-sm leading-relaxed">{answer.text}</p>
            </div>
          ))}
        </section>

        <section className="border-border/60 border-t">
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-10 px-5 py-16 text-center md:px-8 md:py-24 lg:py-32">
            <h2 className="text-3xl font-normal md:text-4xl lg:text-5xl">
              Built for one practitioner and their calendar
            </h2>
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
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 py-16 md:px-8 md:py-24 lg:py-32">
            <div className="flex flex-col items-center gap-4 text-center">
              <h2 className="text-3xl font-normal md:text-4xl lg:text-5xl">
                One plan. Everything in it.
              </h2>
              <p className="text-muted-foreground max-w-lg text-base leading-relaxed">
                You are not paying for a pile of features you will never open. There is one
                version of Cleana+, every practitioner has all of it, and the price does not move
                as your practice does.
              </p>
              {PRICE && (
                <p className="num pt-2 text-4xl font-medium">
                  {PRICE.amount}
                  <span className="text-muted-foreground text-base font-normal">
                    {" "}
                    / {PRICE.period}
                  </span>
                </p>
              )}
            </div>

            <ul className="mx-auto flex max-w-xl flex-col gap-3">
              {OMISSIONS.map((line) => (
                <li
                  key={line}
                  className="border-border/60 text-muted-foreground border-t pt-3 text-sm leading-relaxed first:border-t-0 first:pt-0"
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-border/60 border-t">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-16 md:px-8 md:py-24 lg:py-32">
            <h2 className="text-center text-3xl font-normal md:text-4xl lg:text-5xl">
              Questions
            </h2>
            <div className="flex flex-col gap-6">
              {FAQ.map((item) => (
                <div
                  key={item.q}
                  className="border-border/60 border-t pt-6 first:border-t-0 first:pt-0"
                >
                  <p className="font-medium">{item.q}</p>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-border/60 border-t">
          <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5 px-5 py-16 text-center md:px-8 md:py-24 lg:py-32">
            <h2 className="text-3xl font-normal md:text-4xl lg:text-5xl">Take your first booking</h2>
            <p className="text-muted-foreground max-w-md text-base leading-relaxed md:text-lg">
              Set the hours you work and share one link. The rest is already done.
            </p>
            <Button asChild size="lg" variant="accent" className="font-medium">
              <Link href="/signup">Create your booking link</Link>
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter english />
    </div>
  );
}
