import type { NextRequest } from "next/server";
import { getLogo } from "@/lib/logos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A therapist's uploaded logo, for their booking page and emails. Public by
 * nature (it is shown to anyone with the link). The URL carries a version, so
 * the picture can be cached for good; nosniff keeps it an image.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/public/logo/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const logo = await getLogo(id);
  if (!logo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(logo.data), {
    headers: {
      "Content-Type": logo.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
