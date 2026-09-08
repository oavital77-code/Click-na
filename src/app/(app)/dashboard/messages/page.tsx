import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getCurrentTherapist } from "@/lib/auth";
import { listMessages } from "@/lib/messages-log";
import { getMessages, toLocale } from "@/i18n";
import { MessagesView } from "./messages-view";

export default async function MessagesPage() {
  const therapist = await getCurrentTherapist();
  const locale = toLocale(therapist?.locale);
  const m = getMessages(locale);

  if (!therapist) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center p-8">
        <p className="text-muted-foreground">{m.common.finishingSignup}</p>
      </main>
    );
  }
  if (!therapist.onboardingCompleted) {
    redirect("/dashboard/onboarding");
  }

  const messages = await listMessages(therapist.id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4 text-center md:p-8 md:text-start">
      <PageHeader kicker={m.messageLog.kicker} title={m.messageLog.title} meta={m.messageLog.meta} />
      <MessagesView timezone={therapist.timezone} messages={messages} />
    </main>
  );
}
