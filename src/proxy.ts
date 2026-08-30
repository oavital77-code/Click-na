import { clerkMiddleware } from "@clerk/nextjs/server";

// Only enables auth() / auth.protect() for server components and route handlers.
// Actual protection happens per-route (e.g. src/app/dashboard/layout.tsx) —
// path-matching-based protection here is deprecated by Clerk in favor of
// resource-based auth checks, since middleware matching can diverge from
// how Next.js actually routes a request.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
