import { PageHeader } from "@/components/page-header";
import { redirect } from "next/navigation";
import { getCurrentTherapist } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { statusBadgeClass } from "@/lib/status-badge";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";

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
    include: {
      // Just the most recent appointment per client — enough for "last visit"
      // without pulling every booking they ever made.
      bookings: {
        orderBy: { session: { startsAt: "desc" } },
        take: 1,
        select: { session: { select: { startsAt: true } } },
      },
    },
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {clients.map((client) => {
            const lastVisit = client.bookings[0]?.session.startsAt ?? null;
            return (
              <Card key={client.id} className="gap-4 py-5">
                <CardContent className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={client.fullName} />
                    <div className="flex min-w-0 flex-col text-start">
                      <span className="truncate font-medium">{client.fullName}</span>
                      <span className="num text-muted-foreground truncate text-xs">
                        {client.phone ?? client.email ?? "—"}
                      </span>
                    </div>
                    {client.noShowCount > 0 && (
                      <span className={statusBadgeClass("danger") + " ms-auto"}>
                        {client.noShowCount} לא הגיע/ה
                      </span>
                    )}
                  </div>

                  <div className="border-border grid grid-cols-3 gap-2 border-t pt-3 text-center">
                    <Stat label="תורים" value={String(client.totalBookings)} />
                    <Stat
                      label="ביקור אחרון"
                      value={
                        lastVisit
                          ? formatInTimeZone(lastVisit, therapist.timezone, "d.M.yy")
                          : "—"
                      }
                    />
                    <Stat
                      label="מאז"
                      value={formatInTimeZone(client.createdAt, therapist.timezone, "M/yy")}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="num text-sm font-medium">{value}</span>
      <span className="text-muted-foreground text-[11px] leading-tight">{label}</span>
    </div>
  );
}

// Four warm tints from the system's own ramps, picked by name so a client keeps
// the same colour on every visit to the page. Decorative only — nothing about
// the client is encoded here, so it never has to survive a colour-blind reading.
const AVATAR_TINTS = [
  "bg-st-booked-bg text-st-booked",
  "bg-st-open-bg text-st-open",
  "bg-secondary text-primary-strong",
  "bg-st-blocked-bg text-foreground/70",
];

function Avatar({ name }: { name: string }) {
  const seed = [...name].reduce((sum, char) => sum + char.codePointAt(0)!, 0);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full text-base font-medium",
        AVATAR_TINTS[seed % AVATAR_TINTS.length]
      )}
    >
      {[...name.trim()][0] ?? "?"}
    </span>
  );
}
