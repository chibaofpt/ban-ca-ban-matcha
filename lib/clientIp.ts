const MAX_FORWARDED_HEADER_LENGTH = 512;
const MAX_FORWARDED_HOPS = 20;

function isValidIp(value: string): boolean {
  if (value.length === 0 || value.length > 45) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) {
    return value.split(".").every((part) => {
      if (part.length > 1 && part.startsWith("0")) return false;
      const octet = Number(part);
      return Number.isInteger(octet) && octet >= 0 && octet <= 255;
    });
  }
  if (!value.includes(":") || !/^[0-9a-f:.]+$/i.test(value)) return false;
  try {
    return new URL(`http://[${value}]/`).hostname.length > 2;
  } catch {
    return false;
  }
}

function parseSingleIp(value: string | null): string | null {
  if (value === null) return null;
  const candidate = value.trim();
  return isValidIp(candidate) ? candidate : null;
}

function parseForwardedFor(value: string | null): string | null {
  if (value === null || value.length > MAX_FORWARDED_HEADER_LENGTH) return null;
  const hops = value.split(",").map((hop) => hop.trim());
  if (hops.length === 0 || hops.length > MAX_FORWARDED_HOPS) return null;
  if (hops.some((hop) => !isValidIp(hop))) return null;
  return hops.at(-1) ?? null;
}

/** Resolve a bounded platform/proxy client IP without trusting prepended XFF values. */
export function getClientIp(request: { headers: Headers }): string {
  const vercelIp = request.headers.get("x-vercel-forwarded-for");
  if (vercelIp !== null) return parseSingleIp(vercelIp) ?? "unknown";

  const forwardedIp = parseForwardedFor(request.headers.get("x-forwarded-for"));
  if (forwardedIp !== null) return forwardedIp;

  return parseSingleIp(request.headers.get("x-real-ip")) ?? "unknown";
}
