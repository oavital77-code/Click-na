import { auth } from "@clerk/nextjs/server";
import { ClerkProvider } from "@clerk/nextjs";
import { enUS, heIL } from "@clerk/localizations";
import { getCurrentTherapist } from "@/lib/auth";
import { I18nProvider } from "@/i18n/client";
import { DEFAULT_LOCALE, dirFor, toLocale } from "@/i18n/config";
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

  // Clerk is mounted here rather than at the root so the public booking page
  // ships none of it (see src/app/layout.tsx), and its own strings follow the
  // therapist's language like everything else on the dashboard.
  return (
    <ClerkProvider localization={locale === "he" ? heIL : enUS}>
      <I18nProvider locale={locale}>
        <div dir={dirFor(locale)} className="flex flex-1 flex-col md:flex-row">
          <DashboardNav />
          {/* min-w-0: a flex item defaults to min-width:auto, so the week table
              (1084px) would widen this column and scroll the whole page sideways
              instead of scrolling inside its own container. */}
          <div className="flex min-w-0 flex-1 flex-col">
            {therapist?.subscription && <AccessBanner state={accessState(therapist.subscription)} />}
            {children}
          </div>
        </div>
      </I18nProvider>
    </ClerkProvider>
  );
}
