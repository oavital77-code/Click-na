import { NextResponse, type NextRequest } from "next/server";
import { sendDueReminders } from "@/lib/notifications";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await sendDueReminders();
  return NextResponse.json(summary);
}
