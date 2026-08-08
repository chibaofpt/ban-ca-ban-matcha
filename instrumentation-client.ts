import * as Sentry from "@sentry/nextjs";
import {
  sanitizeClientBreadcrumb,
  sanitizeClientEvent,
} from "@/src/lib/sentryPrivacy";
import { captureSecurityPolicyViolation } from "@/src/lib/observability";

const isProduction = process.env.NEXT_PUBLIC_APP_ENV === "production";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? "development",
  sendDefaultPii: false,
  tracesSampleRate: isProduction ? 0.1 : 0.05,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: isProduction ? 0.1 : 0,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  beforeSend: sanitizeClientEvent,
  beforeBreadcrumb: sanitizeClientBreadcrumb,
});

if (typeof document !== "undefined") {
  document.addEventListener("securitypolicyviolation", captureSecurityPolicyViolation);
}

/** Forward App Router navigations to Sentry performance instrumentation. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
