/** Normalize an email lookup value without proving its ownership or validity. */
export function normalizeAccountEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  const parts = normalized.split("@");
  if (parts.length !== 2 || parts[1] !== "gmail.com") return normalized;
  return `${parts[0].replace(/\./g, "")}@gmail.com`;
}

/** Check the syntax permitted for manually entered ghost account emails. */
export function isValidGhostAccountEmail(value: string): boolean {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || email.includes("+")) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (local.length > 64 || domain.length > 253) return false;
  if (!/^[a-z0-9!#$%&'*\/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*\/=?^_`{|}~-]+)*$/.test(local)) return false;
  const labels = domain.split(".");
  return labels.length >= 2
    && /^[a-z]{2,63}$/.test(labels[labels.length - 1])
    && labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}