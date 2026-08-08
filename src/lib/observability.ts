import * as Sentry from "@sentry/nextjs";
import { sanitizeClientData } from "@/src/lib/sentryPrivacy";

interface SecurityPolicyViolationLike {
  blockedURI: string;
  disposition: string;
  effectiveDirective: string;
  statusCode: number;
  documentURI?: string;
  sample?: string;
  sourceFile?: string;
}

interface SanitizedSecurityPolicyViolation extends Record<string, string | number> {
  blockedOrigin: string;
  disposition: string;
  effectiveDirective: string;
  statusCode: number;
}

function sanitizeBlockedOrigin(blockedUri: string): string {
  if (["inline", "eval", "self"].includes(blockedUri)) return blockedUri;
  if (blockedUri === "") return "unknown";
  try {
    const url = new URL(blockedUri);
    return ["http:", "https:", "ws:", "wss:"].includes(url.protocol)
      ? url.origin
      : url.protocol;
  } catch {
    return "unknown";
  }
}

/** Add an anonymous, privacy-scrubbed business breadcrumb to the active Sentry scope. */
export function addBusinessBreadcrumb(
  name: string,
  data: Record<string, unknown>,
): void {
  Sentry.addBreadcrumb({
    category: "business",
    message: name,
    level: "info",
    data: sanitizeClientData(data),
  });
}

/** Capture an unhandled client error without attaching customer identity. */
export function captureClientException(error: unknown): void {
  Sentry.captureException(error);
}

/** Strip URLs and customer-controlled fields from a browser CSP violation. */
export function sanitizeSecurityPolicyViolation(
  violation: SecurityPolicyViolationLike,
): SanitizedSecurityPolicyViolation {
  return {
    blockedOrigin: sanitizeBlockedOrigin(violation.blockedURI),
    disposition: violation.disposition,
    effectiveDirective: violation.effectiveDirective,
    statusCode: violation.statusCode,
  };
}

/** Capture a privacy-safe browser CSP violation through the Sentry adapter. */
export function captureSecurityPolicyViolation(
  violation: SecurityPolicyViolationLike,
): void {
  Sentry.captureMessage("Content Security Policy violation", {
    level: "warning",
    contexts: { csp: sanitizeSecurityPolicyViolation(violation) },
  });
}
