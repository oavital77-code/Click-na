import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { DELETE, POST } from "@/app/api/public/sessions/[id]/hold/route";

/**
 * A junk id in the hold URL used to reach the uuid column and throw: a 500,
 * and an alert mail to the operator for each one. It is a plain "not found".
 */
describe("hold route with an id that is not one (against a live database)", () => {
  const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  afterEach(async () => {
    await prisma.rateLimit.deleteMany({ where: { key: { contains: ip } } });
  });

  it("answers 404 to POST and DELETE, never 500", async () => {
    const post = await POST(
      new NextRequest("http://localhost/api/public/sessions/abc/hold", { method: "POST", headers: { "x-forwarded-for": ip } }),
      ctx("abc")
    );
    expect(post.status).toBe(404);

    const del = await DELETE(
      new NextRequest("http://localhost/api/public/sessions/abc/hold", {
        method: "DELETE",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ holdToken: "x".repeat(32) }),
      }),
      ctx("abc")
    );
    expect(del.status).toBe(404);
  });
});
