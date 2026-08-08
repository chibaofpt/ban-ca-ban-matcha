import * as Sentry from "@sentry/nextjs";
import { sanitizeSentryEvent } from "@/lib/sentryPrivacy";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? "development",
  sendDefaultPii: false,
  tracesSampleRate: process.env.NEXT_PUBLIC_APP_ENV === "production" ? 0.1 : 0.05,
  beforeSend: sanitizeSentryEvent,
});
