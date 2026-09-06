import { after, type NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { handleUserCreated, handleUserDeleted } from "@/lib/webhooks";
import { sendSignupAlert, sendWelcomeEmail } from "@/lib/account-emails";

export async function POST(request: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(request);
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }

  switch (event.type) {
    case "user.created": {
      const therapistId = await handleUserCreated(event.data);
      // After the response, not before it: Clerk retries a webhook that takes
      // too long, and a retry would create a second welcome for the same person.
      // Null means this delivery was itself a retry, so there is nothing to send.
      if (therapistId) {
        after(async () => {
          await sendWelcomeEmail(therapistId);
          await sendSignupAlert(therapistId);
        });
      }
      break;
    }
    case "user.deleted":
      await handleUserDeleted(event.data);
      break;
    default:
      break;
  }

  return new Response("ok", { status: 200 });
}
