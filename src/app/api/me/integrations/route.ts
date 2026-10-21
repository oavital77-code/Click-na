import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getMessages, toLocale } from "@/i18n";
import { requireTherapist } from "@/lib/route-auth";
import {
  INTEGRATION_PROVIDERS,
  connectIntegration,
  credentialStorageReady,
  disconnectIntegration,
  listIntegrations,
  pauseManagedPayments,
  resumeManagedPayments,
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

  // PayPlus is opened for the therapist under our partnership (see
  // payment-applications.ts), not connected with keys they paste. They can
  // still switch it off and back on; only the owner can wire in a terminal.
  if (parsed.data.provider === "payplus") {
    if (parsed.data.action === "disconnect") {
      await pauseManagedPayments(therapist.id);
    } else if (!(await resumeManagedPayments(therapist.id))) {
      return NextResponse.json(
        { error: getMessages(toLocale(therapist.locale)).paymentSetup.errors.notOpened, ...(await payload(therapist.id, therapist.locale)) },
        { status: 409 }
      );
    }
    return NextResponse.json(await payload(therapist.id, therapist.locale));
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
