import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { accessState } from "@/lib/access";

export const dynamic = "force-dynamic";

/**
 * The owner's view of this product: who signed up, who pays, what came in.
 * Read by the group dashboard (in the Cleana app) with a shared bearer secret;
 * never by a browser. Names and emails are the therapists' own account details,
 * which the owner already holds as the data controller.
 */
export type OwnerStats = {
  product: "cleana-plus";
  generatedAt: string;
  totals: {
    accounts: number;
    trialing: number;
    paying: number;
    grace: number;
    locked: number;
    canceling: number;
    legacyFree: number;
  };
  revenueIls: { thisMonth: number; allTime: number };
  accounts: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    state: string;
    tier: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    lastPaymentAt: string | null;
    lastPaymentIls: number | null;
  }[];
};

function isAuthorized(header: string | null, secret: string): boolean {
  if (!header) return false;
  const provided = createHash("sha256").update(header).digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(provided, expected);
}

export async function GET(request: NextRequest) {
  const secret = process.env.OWNER_STATS_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [therapists, thisMonth, allTime] = await Promise.all([
    prisma.therapist.findMany({
      where: { status: "active" },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: {
        id: true,
        fullName: true,
        email: true,
        createdAt: true,
        subscription: true,
        payments: { where: { status: "succeeded" }, orderBy: { paidAt: "desc" }, take: 1, select: { paidAt: true, amount: true } },
      },
    }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { status: "succeeded", paidAt: { gte: monthStart } } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { status: "succeeded" } }),
  ]);

  const totals: OwnerStats["totals"] = { accounts: 0, trialing: 0, paying: 0, grace: 0, locked: 0, canceling: 0, legacyFree: 0 };
  const accounts: OwnerStats["accounts"] = therapists.map((t) => {
    const sub = t.subscription;
    const state = sub ? accessState(sub, now) : null;
    let label: string;
    if (!sub || !state) label = "none";
    else if (state.kind === "active" && state.periodEnd === null) label = "legacy_free";
    else label = state.kind;
    totals.accounts++;
    if (label === "trialing") totals.trialing++;
    else if (label === "active") totals.paying++;
    else if (label === "grace") totals.grace++;
    else if (label === "locked") totals.locked++;
    else if (label === "canceling") totals.canceling++;
    else if (label === "legacy_free") totals.legacyFree++;
    const last = t.payments[0];
    return {
      id: t.id,
      name: t.fullName,
      email: t.email,
      createdAt: t.createdAt.toISOString(),
      state: label,
      tier: sub?.tier ?? "none",
      trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      lastPaymentAt: last?.paidAt?.toISOString() ?? null,
      lastPaymentIls: last ? Number(last.amount) : null,
    };
  });

  const stats: OwnerStats = {
    product: "cleana-plus",
    generatedAt: now.toISOString(),
    totals,
    revenueIls: { thisMonth: Number(thisMonth._sum.amount ?? 0), allTime: Number(allTime._sum.amount ?? 0) },
    accounts,
  };
  return NextResponse.json(stats);
}
