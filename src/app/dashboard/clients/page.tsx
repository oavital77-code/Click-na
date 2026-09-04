import { PageHeader } from "@/components/page-header";
import { redirect } from "next/navigation";
import { getCurrentTherapist } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { statusBadgeClass } from "@/lib/status-badge";

export default async function ClientsPage() {
  const therapist = await getCurrentTherapist();

  if (!therapist) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center p-8">
        <p className="text-muted-foreground">
          מסיימים את ההרשמה שלך... אם זה נמשך, רענן את הדף.
        </p>
      </main>
    );
  }
  if (!therapist.onboardingCompleted) {
    redirect("/dashboard/onboarding");
  }

  const clients = await prisma.client.findMany({
    where: { therapistId: therapist.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="flex w-full flex-1 flex-col gap-6 p-4 text-center md:p-8 md:text-start">
      <PageHeader
        kicker="אנשים"
        title="לקוחות"
        meta="מי שקבע אצלך תור, וההיסטוריה שלו."
      />

      {clients.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          עדיין אין לקוחות — הם ייווספו כאן אוטומטית ברגע שמישהו יזמין תור דרך הקישור שלך.
        </p>
      ) : (
        // The name column stays pinned and the rest snap into place, so scrolling
        // this table on a phone never strands a row without its client name.
        <div className="snap-x snap-mandatory scroll-ps-32 overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-start">
                <th className="border-border bg-card sticky start-0 z-10 w-32 border-b p-2 text-start font-medium">
                  שם
                </th>
                <th className="border-border snap-start border-b p-2 text-start font-medium">טלפון</th>
                <th className="border-border snap-start border-b p-2 text-start font-medium">מייל</th>
                <th className="border-border snap-start border-b p-2 text-center font-medium">תורים</th>
                <th className="border-border snap-start border-b p-2 text-center font-medium">לא הגיע/ה</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="[&:last-child>td]:border-b-0">
                  <td className="border-border bg-card sticky start-0 z-10 w-32 border-b p-2 text-start font-medium">
                    {client.fullName}
                  </td>
                  <td className="num border-border snap-start border-b p-2 text-start">{client.phone ?? "—"}</td>
                  <td className="num border-border snap-start truncate border-b p-2 text-start">{client.email ?? "—"}</td>
                  <td className="num border-border snap-start border-b p-2 text-center">{client.totalBookings}</td>
                  <td className="border-border snap-start border-b p-2 text-center">
                    {client.noShowCount > 0 ? (
                      <span className={statusBadgeClass("danger")}>{client.noShowCount}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Card>
        <CardContent className="text-muted-foreground py-4 text-xs">
          רשימת הלקוחות נבנית אוטומטית מהזמנות — אין צורך להוסיף לקוחות ידנית.
        </CardContent>
      </Card>
    </main>
  );
}
