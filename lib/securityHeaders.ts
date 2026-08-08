export type CspMode = "report-only" | "enforce" | "off";

export interface CspEnvironment {
  CSP_MODE?: string;
}

const BASE_SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
] as const;

const HSTS_HEADER = {
  key: "Strict-Transport-Security",
  value: "max-age=63072000; includeSubDomains",
} as const;

function isPathWithin(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function resolveCspMode(environment: CspEnvironment): CspMode {
  const configuredMode = environment.CSP_MODE?.trim().toLowerCase();
  if (configuredMode === "enforce" || configuredMode === "off") {
    return configuredMode;
  }
  return "report-only";
}

/** Return immutable baseline response headers, adding HSTS only for Production. */
export function getStaticSecurityHeaders(
  isProductionDeployment: boolean,
): Array<{ key: string; value: string }> {
  const headers: Array<{ key: string; value: string }> = BASE_SECURITY_HEADERS.map(
    (header) => ({ ...header }),
  );
  if (isProductionDeployment) headers.push({ ...HSTS_HEADER });
  return headers;
}

/** Scope browser capabilities to the routes that actually use them. */
export function getPermissionsPolicy(pathname: string): string {
  const canScan = isPathWithin(pathname, "/staff/scan") || isPathWithin(pathname, "/staff/orders");
  const canLocate = isPathWithin(pathname, "/menu") || isPathWithin(pathname, "/profile");

  return [
    `camera=${canScan ? "(self)" : "()"}`,
    "microphone=()",
    `geolocation=${canLocate ? "(self)" : "()"}`,
  ].join(", ");
}

/** Generate an unpredictable base64 nonce using the Web Crypto API. */
export function createCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Build the nonce-based CSP shared by report-only and enforced modes. */
export function buildContentSecurityPolicy(nonce: string): string {
  if (!/^[A-Za-z0-9+/_=-]+$/.test(nonce)) {
    throw new Error("Invalid CSP nonce");
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "frame-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com https://*.goong.io",
    "img-src 'self' data: blob: https://*.supabase.co https://*.goong.io https://api.qrserver.com https://img.vietqr.io",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.goong.io https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");
}

/** Build matching request and response headers so Next.js can propagate the nonce. */
export function buildPageSecurityHeaders(
  pathname: string,
  nonce: string,
  environment: CspEnvironment = { CSP_MODE: process.env.CSP_MODE },
): { request: Headers; response: Headers } {
  const request = new Headers();
  const response = new Headers({ "Permissions-Policy": getPermissionsPolicy(pathname) });
  const mode = resolveCspMode(environment);

  if (mode === "off") return { request, response };

  const key = mode === "enforce"
    ? "Content-Security-Policy"
    : "Content-Security-Policy-Report-Only";
  const policy = buildContentSecurityPolicy(nonce);
  request.set("x-nonce", nonce);
  request.set(key, policy);
  response.set(key, policy);
  return { request, response };
}
