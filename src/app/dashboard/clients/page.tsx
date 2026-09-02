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
    <main className="flex w-full flex-1 flex-col gap-6 p-4 md:p-8">
      <h1 className="text-2xl font-bold">לקוחות</h1>

      {clients.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          עדיין אין לקוחות — הם ייווספו כאן אוטומטית ברגע שמישהו יזמין תור דרך הקישור שלך.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-border border-b text-start">
                <th className="p-2 text-start font-medium">שם</th>
                <th className="p-2 text-start font-medium">טלפון</th>
                <th className="p-2 text-start font-medium">מייל</th>
                <th className="p-2 text-center font-medium">תורים</th>
                <th className="p-2 text-center font-medium">לא הגיע/ה</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="border-border border-b last:border-0">
                  <td className="p-2 font-medium">{client.fullName}</td>
                  <td className="num p-2">{client.phone ?? "—"}</td>
                  <td className="num p-2 truncate">{client.email ?? "—"}</td>
                  <td className="num p-2 text-center">{client.totalBookings}</td>
                  <td className="p-2 text-center">
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
