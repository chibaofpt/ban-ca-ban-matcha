type UnknownRecord = Record<string, unknown>;

const SENSITIVE_KEY = /(?:phone|address|password|secret|token|cookie|authorization|user_?id|product_?id|voucher_?id|order_?id|qr|latitude|longitude|\blat\b|\blng\b)/i;
const URL_VALUE = /https?:\/\/[^\s"'<>]+/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+\/-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const PHONE = /(?<!\d)(?:\+?84|0)\d{9,10}(?!\d)/g;
const LABELED_SECRET = /(?:address|địa chỉ|coordinates?|latitude|longitude|lat|lng|api_?key|password|secret|token)\s*[:=]\s*[^;\n]+/gi;
const COORDINATE_PAIR = /(?<!\d)-?\d{1,2}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}(?!\d)/g;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripUrlMetadata(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.split(/[?#]/, 1)[0];
  }
}

function sanitizeString(value: string): string {
  return value
    .replace(URL_VALUE, stripUrlMetadata)
    .replace(BEARER, "Bearer [Filtered]")
    .replace(JWT, "[Filtered]")
    .replace(PHONE, "[Filtered]")
    .replace(LABELED_SECRET, "[Filtered]")
    .replace(COORDINATE_PAIR, "[Filtered]");
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[Filtered]" : sanitizeValue(nestedValue),
    ]),
  );
}

/** Redact identifiers and customer data from business breadcrumb payloads. */
export function sanitizeBreadcrumbData(data: UnknownRecord): UnknownRecord {
  return sanitizeValue(data) as UnknownRecord;
}

/** Remove URL metadata and sensitive fields from an SDK breadcrumb. */
export function sanitizeSentryBreadcrumb<T extends object>(breadcrumb: T): T {
  return sanitizeValue(breadcrumb) as T;
}

/** Remove request metadata and sensitive values from a Sentry event. */
export function sanitizeSentryEvent<T extends object>(event: T): T {
  const source = event as unknown as UnknownRecord;
  const sanitized = sanitizeValue(source) as UnknownRecord;
  delete sanitized.user;

  if (isRecord(source.request)) {
    const request: UnknownRecord = {};
    if (typeof source.request.url === "string") {
      request.url = stripUrlMetadata(source.request.url);
    }
    sanitized.request = request;
  }
  if (Array.isArray(source.breadcrumbs)) {
    sanitized.breadcrumbs = source.breadcrumbs.map((breadcrumb) =>
      isRecord(breadcrumb) ? sanitizeSentryBreadcrumb(breadcrumb) : sanitizeValue(breadcrumb),
    );
  }
  return sanitized as unknown as T;
}
