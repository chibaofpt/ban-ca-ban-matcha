/** Normalize supported Vietnamese phone formats without discarding invalid letters. */
export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-\.\(\)]/g, "");
  if (/^84\d{9}$/.test(cleaned)) return `+${cleaned}`;
  if (/^\+840\d{9}$/.test(cleaned)) return `+84${cleaned.slice(4)}`;
  if (/^0\d{9}$/.test(cleaned)) return `+84${cleaned.slice(1)}`;
  return cleaned;
}

/** Return the ungrouped local phone format used in editable fields. */
export function toLocalPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  return /^\+84\d{9}$/.test(normalized) ? `0${normalized.slice(3)}` : normalized;
}

/** Recognize phone searches without turning names or Instagram aliases into digits. */
export function isPhoneSearch(query: string): boolean {
  return /^[+\d\s().-]+$/.test(query.trim()) && /\d/.test(query);
}

/** Expand full numbers and explicit local/country-code prefixes for canonical database lookup. */
export function phoneSearchVariants(query: string): string[] {
  if (!isPhoneSearch(query)) return [];
  const clean = query.replace(/[\s\-\.\(\)]/g, "");
  const variants = [clean, normalizePhone(clean)];
  if (/^0\d+$/.test(clean)) variants.push(`+84${clean.slice(1)}`);
  return [...new Set(variants)];
}

/** Preserve staff suffix searches while normalizing complete phone numbers. */
export function normalizeCustomerSearch(query: string): string {
  const trimmed = query.trim();
  if (!isPhoneSearch(trimmed)) return trimmed;
  const normalized = normalizePhone(trimmed);
  return /^\+84\d{9}$/.test(normalized) ? normalized.slice(3) : normalized;
}
