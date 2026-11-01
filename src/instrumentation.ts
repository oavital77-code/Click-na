import type { Instrumentation } from "next";

/**
 * Every server error Next.js catches — a page that failed to render, a route
 * handler that threw — is mailed to the operator (throttled; see
 * lib/error-alerts.ts). Node only: the alert needs the database and the mail
 * client, neither of which runs on the edge.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportServerError } = await import("@/lib/error-alerts");
  await reportServerError({
    error,
    routePath: context.routePath,
    routeType: context.routeType,
    method: request.method,
  });
};
