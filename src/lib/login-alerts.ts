import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { loginAlertEmail } from "@/lib/email-templates";
import { DEFAULT_LOCALE } from "@/i18n";

/**
 * A mail to the operator for every sign-in to the dashboard, from Clerk's
 * session.created webhook. Who, when, and from where (device, browser,
 * place, IP) — as far as Clerk knows them.
 *
 * Not for the first session of a brand-new account: signing up opens one
 * too, and the signup alert already said so.
 */
export type LoginSession = {
  id: string;
  user_id: string;
  created_at: number;
  actor?: Record<string, unknown> | null;
  latest_activity?: {
    device_type?: string;
    is_mobile?: boolean;
    browser_name?: string;
    browser_version?: string;
    ip_address?: string;
    city?: string;
    country?: string;
  } | null;
  user?: {
    /** Milliseconds, as Clerk sends it. */
    created_at?: number | null;
    first_name?: string | null;
    last_name?: string | null;
    primary_email_address_id?: string | null;
    email_addresses?: { id: string; email_address: string }[];
  } | null;
};

/** A session younger than its account by less than this is the signup itself. */
const SIGNUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Clerk sends a signup's user.created and session.created together, in no set
 * order, so the practice may not exist yet when its first session is reported.
 * Looked for again after these pauses before the sign-in counts as a stranger's.
 */
const LOOKUP_RETRIES_MS = [2000, 4000];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function sendLoginAlert(
  session: LoginSession,
  { retryDelaysMs = LOOKUP_RETRIES_MS }: { retryDelaysMs?: number[] } = {}
): Promise<"sent" | "skipped" | "duplicate" | "failed"> {
  const recipient = process.env.OWNER_NOTIFICATION_EMAIL;
  if (!recipient) return "skipped";

  const at = new Date(session.created_at || Date.now());
  const isSignup = (createdAt: number) => at.getTime() - createdAt < SIGNUP_WINDOW_MS;
  // Clerk's own account age, when it sends one, settles it without the database.
  if (session.user?.created_at && isSignup(session.user.created_at)) return "skipped";

  const find = () =>
    prisma.therapist.findUnique({
      where: { clerkUserId: session.user_id },
      select: { fullName: true, email: true, createdAt: true },
    });
  let therapist = await find();
  for (const delay of retryDelaysMs) {
    if (therapist) break;
    await wait(delay);
    therapist = await find();
  }
  if (therapist && isSignup(therapist.createdAt.getTime())) return "skipped";

  // Clerk retries a delivery it did not see answered; one mail per session.
  const key = `login-alert:${session.id}`;
  const row = await prisma.rateLimit.upsert({
    where: { key },
    create: { key, windowStart: new Date(), count: 1 },
    update: { count: { increment: 1 } },
  });
  if (row.count > 1) return "duplicate";

  const user = session.user;
  const userEmail =
    user?.email_addresses?.find((e) => e.id === user.primary_email_address_id)?.email_address ??
    user?.email_addresses?.[0]?.email_address;
  const userName = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
  const a = session.latest_activity ?? {};

  const { subject, html } = loginAlertEmail({
    locale: DEFAULT_LOCALE,
    timezone: "Asia/Jerusalem",
    at,
    name: therapist?.fullName ?? (userName || null),
    email: therapist?.email ?? userEmail ?? null,
    known: !!therapist,
    device: [a.device_type, a.is_mobile ? "mobile" : null].filter(Boolean).join(" · ") || null,
    browser: [a.browser_name, a.browser_version].filter(Boolean).join(" ") || null,
    place: [a.city, a.country].filter(Boolean).join(", ") || null,
    ip: a.ip_address ?? null,
    impersonated: !!session.actor,
  });
  const result = await sendEmail({ to: recipient, subject, html });
  return result.ok ? "sent" : "failed";
}
