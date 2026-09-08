import { clerkClient } from "@clerk/nextjs/server";
import { handleUserCreated, type ClerkUserCreatedData } from "@/lib/webhooks";

/**
 * Reads a Clerk user by id and reshapes it to the webhook payload the creation
 * logic already understands, so both paths share one implementation.
 * Injectable so the provisioning logic can be tested without Clerk.
 */
export type ClerkUserFetcher = (userId: string) => Promise<ClerkUserCreatedData | null>;

export const fetchClerkUser: ClerkUserFetcher = async (userId) => {
  const client = await clerkClient();
  const user = await client.users.getUser(userId).catch(() => null);
  if (!user) return null;
  return {
    id: user.id,
    email_addresses: user.emailAddresses.map((e) => ({
      id: e.id,
      email_address: e.emailAddress,
      verification: e.verification ? { status: e.verification.status } : null,
    })),
    primary_email_address_id: user.primaryEmailAddressId,
    first_name: user.firstName,
    last_name: user.lastName,
  };
};

/**
 * Just-in-time provisioning: the safety net under the user.created webhook.
 *
 * The webhook is the normal way a therapist row comes into being, but a webhook
 * is best-effort by nature — a misconfigured signing secret, a deploy at the
 * wrong moment, a provider outage — and when it misses, the person is left
 * signed in and staring at "finishing your sign-up" with no way out. Instead,
 * the first authenticated request that finds no therapist asks Clerk for the
 * user directly (server-to-server, with the secret key) and runs the very same
 * creation-or-adoption logic the webhook would have. The two paths are
 * idempotent with each other: whichever runs second finds the row and does
 * nothing.
 *
 * Returns the therapist id when a row was created or adopted, null when there
 * was nothing to do (already provisioned, or Clerk knows no such user).
 */
export async function provisionTherapist(
  userId: string,
  fetchUser: ClerkUserFetcher = fetchClerkUser
): Promise<string | null> {
  const data = await fetchUser(userId);
  if (!data) return null;
  return handleUserCreated(data);
}
