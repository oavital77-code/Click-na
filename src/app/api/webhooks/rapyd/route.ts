import type { NextRequest } from "next/server";
import { appUrl } from "@/lib/public-url";
import { verifyRapydWebhook } from "@/lib/rapyd";
import { rapydEnabled } from "@/lib/rapyd-payments";
import { handleRapydEvent } from "@/lib/rapyd-webhook";

/**
 * Rapyd's webhooks. Only a delivery signed with our secret gets past the
 * door, and even then the event only names a payment: handleRapydEvent
 * fetches that payment from Rapyd and decides from Rapyd's own record.
 * 200 once understood, whatever the outcome — a retry would not change it.
 */
export async function POST(request: NextRequest) {
  // Rapyd is shelved unless switched on: keys left behind must not make this
  // route act on anything.
  if (!rapydEnabled()) return new Response("Not found", { status: 404 });
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
  const result = await handleRapydEvent(event);
  console.info("rapyd webhook", { id: event.id, type: event.type, result });
  return Response.json(result);
}
