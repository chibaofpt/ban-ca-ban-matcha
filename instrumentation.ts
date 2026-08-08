import * as Sentry from "@sentry/nextjs";

/** Load the correct Sentry runtime configuration for Next.js. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/** Forward request and nested server-component errors to Sentry. */
export const onRequestError = Sentry.captureRequestError;
