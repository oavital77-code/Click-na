import { auth } from "@clerk/nextjs/server";
import { getCurrentTherapist } from "@/lib/auth";
import { I18nProvider } from "@/i18n/client";
import { DEFAULT_LOCALE, dirFor, toLocale } from "@/i18n/config";
import { DashboardNav } from "./dashboard-nav";

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

  return (
    <I18nProvider locale={locale}>
      <div dir={dirFor(locale)} className="flex flex-1 flex-col md:flex-row">
        <DashboardNav />
        {/* min-w-0: a flex item defaults to min-width:auto, so the week table
            (1084px) would widen this column and scroll the whole page sideways
            instead of scrolling inside its own container. */}
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </I18nProvider>
  );
}
