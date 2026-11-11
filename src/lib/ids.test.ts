import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isUuid } from "@/lib/ids";

describe("isUuid", () => {
  it("accepts a row id and nothing else", () => {
    expect(isUuid("48c0dae4-1f2a-4b3c-8d9e-0123456789ab")).toBe(true);
    expect(isUuid("48C0DAE4-1F2A-4B3C-8D9E-0123456789AB")).toBe(true);
    for (const junk of ["", "abc", "1", "48c0dae4-1f2a-4b3c-8d9e-0123456789a", "48c0dae4-1f2a-4b3c-8d9e-0123456789abc", "' OR 1=1 --"]) {
      expect(isUuid(junk)).toBe(false);
    }
  });
});

/**
 * Every route with an [id] in its path hands it to a uuid column, which throws
 * on anything else: a 500, and an alert mail to the operator per junk id. Each
 * such route must check the id first. See lib/ids.ts.
 */
function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? routes(path) : name === "route.ts" ? [path] : [];
  });
}

describe("routes that take an [id]", () => {
  const idRoutes = routes(join(process.cwd(), "src/app/api")).filter((f) => f.includes("/[id]/"));

  it("finds them", () => {
    expect(idRoutes.length).toBeGreaterThanOrEqual(10);
  });

  it.each(idRoutes.map((f) => [f.slice(f.indexOf("src/app/api")), f]))("%s checks the id before using it", (_, file) => {
    const source = readFileSync(file, "utf8");
    const reads = source.match(/const \{ id \} = await ctx\.params;/g)?.length ?? 0;
    const checks = source.match(/!isUuid\(id\)/g)?.length ?? 0;
    expect(reads).toBeGreaterThan(0);
    expect(checks).toBe(reads);
  });
});
