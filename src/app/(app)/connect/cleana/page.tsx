import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentTherapist } from "@/lib/auth";
import { cleanaLinkConfigured, validState } from "@/lib/cleana-link";
import { getMessages, toLocale } from "@/i18n";

/**
 * Step 2 of the link to Cleana (src/lib/cleana-link.ts): the therapist arrives
 * from Cleana with a `state`, signs in if they have to, and approves. The form
 * posts to our own route, which mints the code and sends them back to Cleana.
 */
export default async function ConnectCleanaPage({ searchParams }: PageProps<"/connect/cleana">) {
  const query = await searchParams;
  const state = query.state;
  const therapist = await getCurrentTherapist();

  if (!therapist) {
    const back = `/connect/cleana${validState(state) ? `?state=${state}` : ""}`;
    redirect(`/login?redirect_url=${encodeURIComponent(back)}`);
  }
  if (!therapist.onboardingCompleted) {
    // New to Cleana+: set up first, then straight back here to approve.
    const next = validState(state) ? `?next=${encodeURIComponent(`/connect/cleana?state=${state}`)}` : "";
    redirect(`/dashboard/onboarding${next}`);
  }

  const m = getMessages(toLocale(therapist.locale)).cleanaLink;
  const problem = !cleanaLinkConfigured() ? m.notConfigured : !validState(state) ? m.invalidRequest : null;

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{m.title}</CardTitle>
          <CardDescription>{problem ?? m.lead}</CardDescription>
        </CardHeader>
        {!problem && (
          <CardContent className="flex flex-col gap-4">
            <ul className="flex list-disc flex-col gap-1 ps-5 text-sm text-muted-foreground">
              <li>{m.canDo}</li>
              <li>{m.cannotSee}</li>
              <li>{m.revoke}</li>
            </ul>
            <form method="post" action="/api/integrations/cleana/authorize" className="flex gap-2">
              <input type="hidden" name="state" value={state as string} />
              <Button type="submit" name="decision" value="approve">
                {m.approve}
              </Button>
              <Button type="submit" name="decision" value="deny" variant="outline">
                {m.deny}
              </Button>
            </form>
          </CardContent>
        )}
      </Card>
    </main>
  );
}
