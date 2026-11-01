import type { NextRequest } from "next/server";
import { appUrl } from "@/lib/public-url";
import { verifyRapydWebhook } from "@/lib/rapyd";

/**
 * Rapyd's webhooks. For now this proves the line works end to end — a signed
 * delivery is accepted and logged, anything else is refused — so the portal
 * can be pointed here before payments are wired in. Handling of the payment
 * events (marking a booking paid) builds on this route.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const headers = {
    salt: request.headers.get("salt"),
    timestamp: request.headers.get("timestamp"),
    signature: request.headers.get("signature"),
    body,
  };
  // Rapyd signs the URL as it was registered in the portal: the public
  // address, or failing that the address this request actually reached.
  const valid =
    verifyRapydWebhook({ ...headers, url: `${appUrl()}/api/webhooks/rapyd` }) ||
    verifyRapydWebhook({ ...headers, url: request.url });
  if (!valid) return new Response("Invalid webhook signature", { status: 401 });

  let event: { id?: string; type?: string } = {};
  try {
    event = JSON.parse(body) as typeof event;
  } catch {
    return new Response("Invalid body", { status: 400 });
  }
  // Ids and type only: the payload carries the payer's details.
  console.info("rapyd webhook", { id: event.id, type: event.type });
  return new Response("ok", { status: 200 });
}
