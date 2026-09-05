import type { NextConfig } from "next";

/**
 * Response headers applied to every route.
 *
 * The Content-Security-Policy is deliberately NOT here — it needs a fresh nonce
 * per request, so it is generated in src/proxy.ts where Clerk's middleware can
 * also keep its own required origins correct as they change. Static headers
 * belong here; per-request ones cannot.
 */
const securityHeaders = [
  {
    // Two years, subdomains included, and eligible for the preload list. Only
    // ever sent over HTTPS, which is all Vercel serves.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    // Superseded by frame-ancestors for modern browsers, kept for older ones.
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Stops a browser from re-interpreting a therapist's uploaded content or a
    // JSON response as something executable.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // A booking link carries a therapist's slug. Cross-origin requests get the
    // origin only, never the path.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // The app asks for none of these, so nothing may.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  // The share cards read their Hebrew font faces off disk at request time.
  // Tracing doesn't always follow a process.cwd() path, and a missing font would
  // fail the image in production only — where nobody would see it until a link
  // was already shared.
  outputFileTracingIncludes: {
    "/opengraph-image": ["./assets/**"],
    "/book/[slug]/opengraph-image": ["./assets/**"],
    "/icon": ["./assets/**"],
  },
};

export default nextConfig;
