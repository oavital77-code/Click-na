import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getCurrentTherapist } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accessState } from "@/lib/access";
import { billingAvailability } from "@/lib/billing";
import { formatPriceIls, planPriceIls } from "@/lib/plan";
import { getMessages, toLocale } from "@/i18n";
import { BillingView } from "./billing-view";

export default async function BillingPage({ searchParams }: PageProps<"/dashboard/billing">) {
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
  if (!therapist.onboardingCompleted) redirect("/dashboard/onboarding");
  if (!therapist.subscription) redirect("/dashboard");

  const { returned } = await searchParams;
  const availability = billingAvailability();
  // The price is shown whenever one is decided, even before the payment
  // provider is wired up — a therapist on trial should know what comes next.
  const price = planPriceIls();
  const payments = await prisma.payment.findMany({
    where: { therapistId: therapist.id },
    orderBy: { createdAt: "desc" },
    take: 24,
  });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 text-center md:p-8 md:text-start">
      <PageHeader kicker={m.billing.kicker} title={m.billing.title} meta={m.billing.meta} />
      <BillingView
        state={accessState(therapist.subscription)}
        price={price === null ? null : formatPriceIls(price, locale)}
        canPay={availability.ok}
        timezone={therapist.timezone}
        returned={typeof returned === "string" ? returned : null}
        payments={payments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          status: p.status,
          paidAt: (p.paidAt ?? p.createdAt).toISOString(),
          periodEnd: p.periodEnd?.toISOString() ?? null,
        }))}
      />
    </main>
  );
}
