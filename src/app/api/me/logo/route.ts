import { NextResponse, type NextRequest } from "next/server";
import { requireTherapist } from "@/lib/route-auth";
import { MAX_LOGO_BYTES, removeLogo, saveLogo } from "@/lib/logos";

/** Upload (multipart, field "file") or remove the therapist's booking-page logo. */
export async function POST(request: NextRequest) {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "empty" }, { status: 422 });
  if (file.size > MAX_LOGO_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const result = await saveLogo(gate.therapist.id, new Uint8Array(await file.arrayBuffer()));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === "too_large" ? 413 : 422 });
  return NextResponse.json({ url: result.url });
}

export async function DELETE() {
  const gate = await requireTherapist({ write: true });
  if (!gate.ok) return gate.response;
  await removeLogo(gate.therapist.id);
  return NextResponse.json({ ok: true });
}
