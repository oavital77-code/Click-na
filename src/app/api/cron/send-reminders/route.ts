import { NextResponse, type NextRequest } from "next/server";
import { sendDueReminders } from "@/lib/notifications";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Without a secret this endpoint is callable by anyone, who could drain the
    // email quota by hitting it repeatedly. Stay open only outside production,
    // where calling it unauthenticated is a documented convenience.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "cron_secret_not_configured" }, { status: 503 });
    }
  } else if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await sendDueReminders();
  return NextResponse.json(summary);
}
