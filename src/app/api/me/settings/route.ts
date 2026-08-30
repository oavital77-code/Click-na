import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { settingsSchema } from "@/lib/settings-schema";
import { updateSettings } from "@/lib/settings";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({
    where: { clerkUserId: userId },
    include: { settings: true },
  });
  if (!therapist?.settings) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ settings: therapist.settings });
}

export async function PATCH(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const therapist = await prisma.therapist.findUnique({ where: { clerkUserId: userId } });
  if (!therapist) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = settingsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });
  }

  const settings = await updateSettings(therapist.id, parsed.data);
  return NextResponse.json({ settings });
}
