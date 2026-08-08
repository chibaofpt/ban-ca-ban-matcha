type UnknownRecord = Record<string, unknown>;

const SENSITIVE_KEY = /(?:phone|address|password|secret|token|cookie|authorization|user_?id|product_?id|voucher_?id|order_?id|qr)/i;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[Filtered]" : sanitizeValue(nestedValue),
    ]),
  );
}

function stripUrlQuery(url: unknown): unknown {
  if (typeof url !== "string") return url;
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

/** Redact identifiers and customer data from business breadcrumb payloads. */
export function sanitizeBreadcrumbData(data: UnknownRecord): UnknownRecord {
  return sanitizeValue(data) as UnknownRecord;
}

/** Remove query strings and sensitive fields from an SDK breadcrumb. */
export function sanitizeSentryBreadcrumb<T extends object>(breadcrumb: T): T {
  const source = breadcrumb as unknown as UnknownRecord;
  const clean: UnknownRecord = { ...source };
  clean.message = stripUrlQuery(clean.message);
  if (isRecord(clean.data)) clean.data = sanitizeBreadcrumbData(clean.data);
  return clean as unknown as T;
}

/** Remove request bodies, credentials, query strings and sensitive context from a Sentry event. */
export function sanitizeSentryEvent<T extends object>(event: T): T {
  const source = event as unknown as UnknownRecord;
  const sanitized: UnknownRecord = { ...source };

  if (isRecord(source.request)) {
    const request = { ...source.request };
    request.url = stripUrlQuery(request.url);
    delete request.data;

    if (isRecord(request.headers)) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(
          ([key]) => !/^(?:authorization|cookie)$/i.test(key),
        ),
      );
    }
    sanitized.request = request;
  }

  if (isRecord(source.extra)) sanitized.extra = sanitizeValue(source.extra);
  if (isRecord(source.contexts)) sanitized.contexts = sanitizeValue(source.contexts);
  if (isRecord(source.tags)) sanitized.tags = sanitizeValue(source.tags);
  delete sanitized.user;

  if (Array.isArray(source.breadcrumbs)) {
    sanitized.breadcrumbs = source.breadcrumbs.map((breadcrumb) => {
      if (!isRecord(breadcrumb)) return breadcrumb;
      const clean = { ...breadcrumb };
      clean.message = stripUrlQuery(clean.message);
      if (isRecord(clean.data)) clean.data = sanitizeBreadcrumbData(clean.data);
      return clean;
    });
  }

  return sanitized as unknown as T;
}
