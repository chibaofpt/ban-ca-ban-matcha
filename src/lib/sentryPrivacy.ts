type UnknownRecord = Record<string, unknown>;

const SENSITIVE_KEY = /(?:phone|address|password|secret|token|cookie|authorization|user_?id|product_?id|voucher_?id|order_?id|qr)/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[Filtered]" : sanitize(nestedValue),
    ]),
  );
}

function stripQuery(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value.split("?", 1)[0];
}

/** Redact customer identifiers from client-side business data. */
export function sanitizeClientData(data: UnknownRecord): UnknownRecord {
  return sanitize(data) as UnknownRecord;
}

/** Sanitize a client event before it leaves the browser. */
export function sanitizeClientEvent<T extends object>(event: T): T {
  const source = event as unknown as UnknownRecord;
  const clean: UnknownRecord = { ...source };
  delete clean.user;
  if (typeof clean.request === "object" && clean.request !== null) {
    const request = { ...(clean.request as UnknownRecord) };
    request.url = stripQuery(request.url);
    delete request.data;
    delete request.headers;
    clean.request = request;
  }
  if (typeof clean.extra === "object" && clean.extra !== null) clean.extra = sanitize(clean.extra);
  if (typeof clean.contexts === "object" && clean.contexts !== null) clean.contexts = sanitize(clean.contexts);
  return clean as unknown as T;
}

/** Sanitize a client breadcrumb before it leaves the browser. */
export function sanitizeClientBreadcrumb<T extends object>(breadcrumb: T): T {
  const source = breadcrumb as unknown as UnknownRecord;
  const clean: UnknownRecord = { ...source, message: stripQuery(source.message) };
  if (typeof clean.data === "object" && clean.data !== null) {
    clean.data = sanitizeClientData(clean.data as UnknownRecord);
  }
  return clean as unknown as T;
}
