import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { errorAlertEmail } from "@/lib/email-templates";
import { DEFAULT_LOCALE } from "@/i18n";

/**
 * A server error mailed to the operator, so a broken page is heard about from
 * the site rather than from the therapist it broke for.
 *
 * Throttled twice over: the same error (route + message) at most once an hour,
 * and at most ALERTS_PER_HOUR alerts of any kind. The second cap is what keeps
 * an outage — every request failing at once — from emptying the mail quota the
 * therapists' own mail depends on. Both are counted in the database so every
 * server instance shares them; when the database is the thing that is down, a
 * per-instance memory takes over instead of letting every error through.
 */
export const ALERTS_PER_HOUR = 10;
const HOUR = 60 * 60 * 1000;

export type ErrorReport = {
  error: unknown;
  /** The route file pattern (`/book/[slug]/manage/[token]`), never the real path: no tokens in mail. */
  routePath: string;
  routeType: string;
  method: string;
  now?: Date;
};

/** Next's own control flow (redirect(), notFound()) travels as thrown errors; none of it is a fault. */
const CONTROL_FLOW = /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/;

function describe(error: unknown): { name: string; message: string; digest: string | null; stack: string | null } {
  const digest =
    typeof error === "object" && error !== null && "digest" in error && error.digest != null ? String(error.digest) : null;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message.slice(0, 600),
      digest,
      stack: error.stack ? error.stack.split("\n").slice(1, 9).join("\n") : null,
    };
  }
  return { name: "Error", message: String(error).slice(0, 600), digest, stack: null };
}

// Per-instance fallback, used only when the shared counter cannot be reached.
const memory = new Map<string, number>();

function memoryAllows(key: string, limit: number, now: number): boolean {
  const windowKey = `${key}:${Math.floor(now / HOUR)}`;
  const count = (memory.get(windowKey) ?? 0) + 1;
  memory.set(windowKey, count);
  if (memory.size > 500) memory.clear();
  return count <= limit;
}

async function allowed(key: string, limit: number, now: Date): Promise<boolean> {
  const windowIndex = Math.floor(now.getTime() / HOUR);
  const id = `error-alert:${key}:${windowIndex}`;
  try {
    const row = await prisma.rateLimit.upsert({
      where: { key: id },
      create: { key: id, windowStart: new Date(windowIndex * HOUR), count: 1 },
      update: { count: { increment: 1 } },
    });
    return row.count <= limit;
  } catch {
    return memoryAllows(key, limit, now.getTime());
  }
}

/** Never throws: reporting a failure must not become a second one. */
export async function reportServerError(report: ErrorReport): Promise<"sent" | "skipped" | "throttled" | "failed"> {
  try {
    const now = report.now ?? new Date();
    const info = describe(report.error);
    if (CONTROL_FLOW.test(info.message) || (info.digest && CONTROL_FLOW.test(info.digest))) return "skipped";

    const recipient = process.env.OWNER_NOTIFICATION_EMAIL;
    if (!recipient) return "skipped";

    const fingerprint = createHash("sha256").update(`${report.routePath}\n${info.message}`).digest("hex").slice(0, 16);
    // The specific error first: a repeat should not use up the global allowance.
    if (!(await allowed(fingerprint, 1, now))) return "throttled";
    if (!(await allowed("all", ALERTS_PER_HOUR, now))) return "throttled";

    const { subject, html } = errorAlertEmail({
      locale: DEFAULT_LOCALE,
      at: now,
      timezone: "Asia/Jerusalem",
      method: report.method,
      routePath: report.routePath,
      routeType: report.routeType,
      errorName: info.name,
      message: info.message,
      digest: info.digest,
      stack: info.stack,
    });
    const result = await sendEmail({ to: recipient, subject, html });
    return result.ok ? "sent" : "failed";
  } catch (error) {
    console.error("[error-alert] could not report", error);
    return "failed";
  }
}
