import { auth } from "@clerk/nextjs/server";
import { getCurrentTherapist } from "@/lib/auth";
import { I18nProvider } from "@/i18n/client";
import { DEFAULT_LOCALE, dirFor, toLocale } from "@/i18n/config";
import { getMessages } from "@/i18n";
import { DashboardNav } from "./dashboard-nav";
import { AccessBanner } from "@/components/access-banner";
import { accessState } from "@/lib/access";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await auth.protect();
  // The therapist row may not exist for a few seconds after sign-up (the Clerk
  // webhook creates it); the pages below already handle that, so here it only
  // means "default language until then".
  const therapist = await getCurrentTherapist();
  const locale = therapist ? toLocale(therapist.locale) : DEFAULT_LOCALE;

  // A suspended practice sees why, and nothing else.
  if (therapist && therapist.status !== "active") {
    return (
      <I18nProvider locale={locale}>
        <main dir={dirFor(locale)} className="flex flex-1 items-center justify-center p-8 text-center">
          <p className="text-muted-foreground max-w-md">{getMessages(locale).common.accountSuspended}</p>
        </main>
      </I18nProvider>
    );
  }

  // Clerk itself is mounted one level up, in the (app) layout shared with
  // sign-in, so it survives the navigation from the sign-in form to here.
  return (
    <I18nProvider locale={locale}>
      <div dir={dirFor(locale)} className="flex flex-1 flex-col md:flex-row">
        <DashboardNav />
        {/* min-w-0: a flex item defaults to min-width:auto, so the week table
            (1084px) would widen this column and scroll the whole page sideways
            instead of scrolling inside its own container. */}
        <div className="flex min-w-0 flex-1 flex-col pb-24 md:pb-0">
          {therapist?.subscription && <AccessBanner state={accessState(therapist.subscription)} />}
          {children}
        </div>
      </div>
    </I18nProvider>
  );
}
