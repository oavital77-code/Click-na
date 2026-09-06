import { PageHeader } from "@/components/page-header";
import { redirect } from "next/navigation";
import { getCurrentTherapist } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { statusBadgeClass } from "@/lib/status-badge";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";
import { getMessages, toLocale, dateFnsLocale } from "@/i18n";

export default async function ClientsPage() {
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
        kicker={m.pages.clients.kicker}
        title={m.pages.clients.title}
        meta={m.pages.clients.meta}
      />

      {clients.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.clients.empty}</p>
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
                        {m.clients.noShows(client.noShowCount)}
                      </span>
                    )}
                  </div>

                  <div className="border-border grid grid-cols-3 gap-2 border-t pt-3 text-center">
                    <Stat label={m.clients.stats.bookings} value={String(client.totalBookings)} />
                    <Stat
                      label={m.clients.stats.lastVisit}
                      value={
                        lastVisit
                          ? formatInTimeZone(lastVisit, therapist.timezone, locale === "he" ? "d.M.yy" : "d MMM yy", {
                              locale: dateFnsLocale(locale),
                            })
                          : "—"
                      }
                    />
                    <Stat
                      label={m.clients.stats.since}
                      value={formatInTimeZone(client.createdAt, therapist.timezone, locale === "he" ? "M/yy" : "MMM yy", {
                        locale: dateFnsLocale(locale),
                      })}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardContent className="text-muted-foreground py-4 text-xs">{m.clients.autoNote}</CardContent>
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
