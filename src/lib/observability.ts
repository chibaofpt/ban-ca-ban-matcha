import * as Sentry from "@sentry/nextjs";
import { sanitizeClientData } from "@/src/lib/sentryPrivacy";
import type {
  MapRendererFailureCategory,
  MapRendererPhase,
} from "@/src/lib/map/mapRenderer";

export type MapLoadDurationBucket = "<3s" | "3-8s" | "8-15s" | ">15s";

interface MapRendererTelemetry {
  category: MapRendererFailureCategory;
  durationBucket: MapLoadDurationBucket;
  fallback: "search";
  fatal: boolean;
  phase: MapRendererPhase;
  renderer: "maplibre";
}

const reportedMapCategories = new Set<MapRendererFailureCategory>();

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

/** Convert elapsed map load time to a low-cardinality privacy-safe bucket. */
export function getMapLoadDurationBucket(elapsedMs: number): MapLoadDurationBucket {
  if (elapsedMs < 3_000) return "<3s";
  if (elapsedMs < 8_000) return "3-8s";
  if (elapsedMs < 15_000) return "8-15s";
  return ">15s";
}

/** Record a deduplicated map diagnostic containing enum-only metadata. */
export function recordMapRendererDiagnostic(event: MapRendererTelemetry): void {
  if (reportedMapCategories.has(event.category)) return;
  reportedMapCategories.add(event.category);
  const data = {
    category: event.category,
    durationBucket: event.durationBucket,
    fallback: event.fallback,
    phase: event.phase,
    renderer: event.renderer,
  };

  if (event.fatal) {
    Sentry.captureMessage("Map renderer unavailable", {
      contexts: { map_renderer: data },
      level: "error",
    });
    return;
  }
  Sentry.addBreadcrumb({ category: "map.renderer", data, level: "warning" });
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
