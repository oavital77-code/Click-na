import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getCurrentTherapist } from "@/lib/auth";
import { isOwner, listApplications } from "@/lib/payment-applications";
import { getMessages, toLocale } from "@/i18n";
import { OwnerApplicationsView } from "./owner-view";

/** The owner's queue of card-payment applications to forward to PayPlus. */
export default async function OwnerPage() {
  const therapist = await getCurrentTherapist();
  if (!therapist) redirect("/dashboard");
  if (!isOwner(therapist.email)) notFound();
  const m = getMessages(toLocale(therapist.locale));

  return (
    <main className="flex w-full flex-1 flex-col gap-6 p-4 text-center md:p-8 md:text-start">
      <PageHeader kicker={m.paymentSetup.owner.kicker} title={m.paymentSetup.owner.title} meta={m.paymentSetup.owner.meta} />
      <OwnerApplicationsView initial={await listApplications()} />
    </main>
  );
}
