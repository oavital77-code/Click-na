import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentTherapist } from "@/lib/auth";
import {
  INTEGRATION_PROVIDERS,
  ProviderUnavailableError,
  connectIntegration,
  disconnectIntegration,
  listIntegrations,
} from "@/lib/integrations";

const bodySchema = z.object({
  provider: z.enum(INTEGRATION_PROVIDERS),
  action: z.enum(["connect", "disconnect"]),
});

export async function GET() {
  const therapist = await getCurrentTherapist();
  if (!therapist) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  return NextResponse.json({ integrations: await listIntegrations(therapist.id) });
}

export async function POST(request: NextRequest) {
  const therapist = await getCurrentTherapist();
  if (!therapist) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });
  }

  const { provider, action } = parsed.data;
  try {
    if (action === "connect") {
      await connectIntegration(therapist.id, provider);
    } else {
      await disconnectIntegration(therapist.id, provider);
    }
  } catch (error) {
    // The button is disabled client-side when a provider has no credentials, so
    // this is the guard against a request that skipped the UI.
    if (error instanceof ProviderUnavailableError) {
      return NextResponse.json({ error: "provider_unavailable" }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ integrations: await listIntegrations(therapist.id) });
}
