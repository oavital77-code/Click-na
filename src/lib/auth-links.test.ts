import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/lib/csp";

/**
 * Public pages carry a policy that allows no connection to Clerk. A <Link>
 * from one of them into sign-in/sign-up is a client-side navigation that keeps
 * that policy, and the form's first "Continue" then silently does nothing.
 * Those links must be AuthLink (a full page load). See components/auth-link.tsx.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx$/.test(name) ? [path] : [];
  });
}

const APP = join(process.cwd(), "src/app");
// Public route files: the landing page, the legal pages and /book.
const publicFiles = files(APP).filter((file) => {
  const route = file.slice(APP.length).replace(/\/[^/]+\.tsx$/, "") || "/";
  return !route.startsWith("/(app)") && !route.startsWith("/api") && (isPublicPath(route) || isPublicPath(`${route}/`));
});

describe("links from public pages into sign-in", () => {
  it("finds the public pages it guards", () => {
    expect(publicFiles.some((f) => f.endsWith("src/app/page.tsx"))).toBe(true);
  });

  it.each(publicFiles.map((f) => [f.slice(process.cwd().length + 1)]))("%s uses AuthLink, not <Link>", (file) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    expect(source).not.toMatch(/<Link[^>]*href=["{`]+\/(login|signup)/);
  });
});
