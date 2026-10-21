import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/public-url";
import { sendEmail } from "@/lib/email";
import { decryptJson, encryptJson, hasEncryptionKey } from "@/lib/secret-box";
import { connectIntegration, type ConnectResult } from "@/lib/integrations";
import { recordAccountEmail } from "@/lib/account-emails";
import {
  paymentApplicationAlertEmail,
  paymentApplicationApprovedEmail,
  paymentApplicationRejectedEmail,
} from "@/lib/email-templates";
import {
  maskAccount,
  paymentApplicationSchema,
  type BusinessType,
  type PaymentApplicationDetails,
} from "@/lib/payment-application-schema";
import { PAYMENT_TERMS_VERSION, PLATFORM_FEE_PERCENT } from "@/lib/plan";
import { DEFAULT_LOCALE, getMessages, toLocale, translateIssue, type Locale } from "@/i18n";

/**
 * Card payments for clients, the partnership way: a therapist fills in their
 * business and bank details once, we hand them to PayPlus, PayPlus opens the
 * account and gives us its terminal, and the owner wires that terminal into
 * the therapist's payplus add-on. The therapist never sees an API key.
 *
 * The owner of Cleana+ is whoever OWNER_NOTIFICATION_EMAIL names (comma
 * separated for more than one) — the same address that already receives the
 * signup and daily-job alerts. Unset, nobody is the owner and the review
 * screen does not exist.
 */
export function ownerEmails(env: Record<string, string | undefined> = process.env): string[] {
  return (env.OWNER_NOTIFICATION_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwner(email: string | null | undefined, env: Record<string, string | undefined> = process.env) {
  return !!email && ownerEmails(env).includes(email.trim().toLowerCase());
}

export type ApplicationSummary = {
  status: "pending" | "active" | "rejected";
  submittedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  feePct: number;
  legalName: string;
  businessType: BusinessType;
  bankAccount: string;
};

function readDetails(encrypted: string): PaymentApplicationDetails | null {
  try {
    return decryptJson<PaymentApplicationDetails>(encrypted);
  } catch {
    return null;
  }
}

/** What the therapist sees about their own application. Never the ID or full account number. */
export async function getApplicationSummary(therapistId: string): Promise<ApplicationSummary | null> {
  const row = await prisma.paymentApplication.findUnique({ where: { therapistId } });
  if (!row) return null;
  const details = readDetails(row.details);
  return {
    status: row.status,
    submittedAt: row.updatedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    feePct: Number(row.platformFeePct),
    legalName: details?.legalName ?? "",
    businessType: details?.businessType ?? "exempt",
    bankAccount: details
      ? `${details.bankCode}-${details.branchCode}-${maskAccount(details.accountNumber)}`
      : "",
  };
}

export type SubmitResult =
  | { ok: true; application: ApplicationSummary }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function submitApplication(
  therapistId: string,
  input: unknown,
  options: { ip?: string | null; locale?: Locale } = {}
): Promise<SubmitResult> {
  const m = getMessages(options.locale ?? DEFAULT_LOCALE);
  const parsed = paymentApplicationSchema.safeParse(input ?? {});
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = translateIssue(m, issue.message);
    }
    return { ok: false, error: m.paymentSetup.errors.fixFields, fieldErrors };
  }
  if (!hasEncryptionKey()) {
    return { ok: false, error: m.integrations.errors.storageNotConfigured };
  }

  const existing = await prisma.paymentApplication.findUnique({ where: { therapistId } });
  if (existing?.status === "active") {
    return { ok: false, error: m.paymentSetup.errors.alreadyActive };
  }

  // acceptTerms is a literal `true` by now; what is kept is the version and time below.
  const details: PaymentApplicationDetails = { ...parsed.data };
  delete (details as Partial<typeof parsed.data>).acceptTerms;
  const now = new Date();
  const data = {
    status: "pending" as const,
    details: encryptJson(details),
    termsVersion: PAYMENT_TERMS_VERSION,
    termsAcceptedAt: now,
    termsAcceptedIp: options.ip?.slice(0, 64) ?? null,
    platformFeePct: PLATFORM_FEE_PERCENT,
    rejectionReason: null,
    reviewedAt: null,
  };
  await prisma.paymentApplication.upsert({
    where: { therapistId },
    create: { therapistId, ...data },
    update: data,
  });

  await alertOwner(therapistId, details.legalName);

  return { ok: true, application: (await getApplicationSummary(therapistId))! };
}

/** Tells the owner there is an application to forward. No ID or bank details in the mail itself. */
async function alertOwner(therapistId: string, legalName: string) {
  const recipients = ownerEmails();
  if (recipients.length === 0) return;
  const therapist = await prisma.therapist.findUnique({ where: { id: therapistId }, select: { fullName: true, email: true } });
  if (!therapist) return;
  const { subject, html } = paymentApplicationAlertEmail({
    locale: DEFAULT_LOCALE,
    therapistFullName: therapist.fullName,
    therapistEmail: therapist.email,
    legalName,
    reviewUrl: `${appUrl()}/dashboard/owner`,
  });
  await Promise.all(recipients.map((to) => sendEmail({ to, subject, html })));
}

export type OwnerApplication = {
  id: string;
  therapistId: string;
  therapistName: string;
  therapistEmail: string;
  status: "pending" | "active" | "rejected";
  submittedAt: string;
  termsVersion: string;
  termsAcceptedAt: string;
  feePct: number;
  rejectionReason: string | null;
  /** Null when the row cannot be decrypted (a rotated key). */
  details: PaymentApplicationDetails | null;
};

/** Every application, newest first, with the details the owner forwards to PayPlus. Owner-only. */
export async function listApplications(): Promise<OwnerApplication[]> {
  const rows = await prisma.paymentApplication.findMany({
    orderBy: { updatedAt: "desc" },
    include: { therapist: { select: { fullName: true, email: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    therapistId: row.therapistId,
    therapistName: row.therapist.fullName,
    therapistEmail: row.therapist.email,
    status: row.status,
    submittedAt: row.updatedAt.toISOString(),
    termsVersion: row.termsVersion,
    termsAcceptedAt: row.termsAcceptedAt.toISOString(),
    feePct: Number(row.platformFeePct),
    rejectionReason: row.rejectionReason,
    details: readDetails(row.details),
  }));
}

/**
 * The account PayPlus opened, wired in. The terminal's credentials go through
 * the same verification and encrypted storage as any add-on, under the
 * therapist's payplus integration — from there client payments work as before.
 */
export async function approveApplication(applicationId: string, credentials: unknown): Promise<ConnectResult> {
  const row = await prisma.paymentApplication.findUnique({
    where: { id: applicationId },
    include: { therapist: { select: { email: true, fullName: true, locale: true } } },
  });
  if (!row) return { ok: false, error: "not found" };
  const locale = toLocale(row.therapist.locale);

  const connected = await connectIntegration(row.therapistId, "payplus", credentials, locale);
  if (!connected.ok) return connected;

  await prisma.paymentApplication.update({
    where: { id: row.id },
    data: { status: "active", reviewedAt: new Date(), rejectionReason: null },
  });

  const { subject, html } = paymentApplicationApprovedEmail({
    locale,
    therapistFullName: row.therapist.fullName,
    feePct: Number(row.platformFeePct),
    addonsUrl: `${appUrl()}/dashboard/addons`,
  });
  await recordAccountEmail({ therapistId: row.therapistId, type: "payment_setup", recipient: row.therapist.email, subject, html });
  return { ok: true };
}

export async function rejectApplication(applicationId: string, reason: string): Promise<{ ok: boolean }> {
  const trimmed = reason.trim().slice(0, 500);
  const row = await prisma.paymentApplication.findUnique({
    where: { id: applicationId },
    include: { therapist: { select: { email: true, fullName: true, locale: true } } },
  });
  if (!row || !trimmed) return { ok: false };

  await prisma.paymentApplication.update({
    where: { id: row.id },
    data: { status: "rejected", reviewedAt: new Date(), rejectionReason: trimmed },
  });

  const locale = toLocale(row.therapist.locale);
  const { subject, html } = paymentApplicationRejectedEmail({
    locale,
    therapistFullName: row.therapist.fullName,
    reason: trimmed,
    addonsUrl: `${appUrl()}/dashboard/addons`,
  });
  await recordAccountEmail({ therapistId: row.therapistId, type: "payment_setup", recipient: row.therapist.email, subject, html });
  return { ok: true };
}
