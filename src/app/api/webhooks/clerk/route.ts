import type { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { handleUserCreated, handleUserDeleted } from "@/lib/webhooks";

export async function POST(request: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(request);
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }

  switch (event.type) {
    case "user.created":
      await handleUserCreated(event.data);
      break;
    case "user.deleted":
      await handleUserDeleted(event.data);
      break;
    default:
      break;
  }

  return new Response("ok", { status: 200 });
}
