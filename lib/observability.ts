import * as Sentry from "@sentry/nextjs";
import { sanitizeBreadcrumbData } from "@/lib/sentryPrivacy";

/** Capture a server-side exception with only sanitized operational context. */
export function captureServerException(
  error: unknown,
  context: Record<string, string>,
): void {
  Sentry.captureException(error, {
    contexts: { operation: sanitizeBreadcrumbData(context) },
  });
}

/** Record legacy identifier compatibility use without attaching the identifier itself. */
export function recordLegacyIdentifierFallback(
  entity: "user" | "voucher",
  scope: "customer" | "owner" | "staff",
): void {
  Sentry.addBreadcrumb({
    category: "compat.public-identifier",
    message: "Legacy database UUID input resolved",
    level: "warning",
    data: { entity, scope },
  });
}

/** Wrap the production auto-cancel worker in a Sentry Cron Monitor check-in. */
export function withAutoCancelMonitor<T>(callback: () => T): T {
  if (process.env.NEXT_PUBLIC_APP_ENV !== "production") return callback();

  return Sentry.withMonitor("cancel-expired-orders", callback, {
    schedule: { type: "crontab", value: "*/5 * * * *" },
    checkinMargin: 2,
    maxRuntime: 4,
    timezone: "UTC",
  });
}
