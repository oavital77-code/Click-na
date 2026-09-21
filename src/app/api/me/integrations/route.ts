import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { toLocale } from "@/i18n";
import { requireTherapist } from "@/lib/route-auth";
import {
  INTEGRATION_PROVIDERS,
  connectIntegration,
  credentialStorageReady,
  disconnectIntegration,
  listIntegrations,
} from "@/lib/integrations";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("connect"),
    provider: z.enum(INTEGRATION_PROVIDERS),
    // Shape is validated per provider inside connectIntegration — the route only
    // needs to know it's a flat bag of strings.
    credentials: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    action: z.literal("disconnect"),
    provider: z.enum(INTEGRATION_PROVIDERS),
  }),
]);

async function payload(therapistId: string, locale: string) {
  return {
    integrations: await listIntegrations(therapistId, toLocale(locale)),
    credentialStorageReady: credentialStorageReady(),
  };
}

export async function GET() {
  const gate = await requireTherapist();
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  return NextResponse.json(await payload(therapist.id, therapist.locale));
}

export async function POST(request: NextRequest) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;
  const { therapist } = gate;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });
  }

  if (parsed.data.action === "disconnect") {
    await disconnectIntegration(therapist.id, parsed.data.provider);
    return NextResponse.json(await payload(therapist.id, therapist.locale));
  }

  const result = await connectIntegration(
    therapist.id,
    parsed.data.provider,
    parsed.data.credentials ?? {},
    toLocale(therapist.locale)
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, fieldErrors: result.fieldErrors, ...(await payload(therapist.id, therapist.locale)) },
      { status: 422 }
    );
  }

  return NextResponse.json(await payload(therapist.id, therapist.locale));
}
