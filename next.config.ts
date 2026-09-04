import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
