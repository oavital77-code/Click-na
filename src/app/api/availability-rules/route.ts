import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { listRulesWithCounts, createRules } from "@/lib/availability-rules";
import { ruleCreateSchema } from "@/lib/availability-rule-schema";
import { writeBlocked } from "@/lib/require-access";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({ where: { clerkUserId: userId } });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const rules = await listRulesWithCounts(therapist.id);
  return NextResponse.json({ rules });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({ where: { clerkUserId: userId } });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const blocked = await writeBlocked(therapist.id);
  if (blocked) return blocked;

  const parsed = ruleCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });
  }

  await createRules(therapist.id, parsed.data);
  return NextResponse.json({ ok: true }, { status: 201 });
}
