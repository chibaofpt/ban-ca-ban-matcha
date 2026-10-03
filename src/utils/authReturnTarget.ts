const FALLBACK_AUTH_TARGET = "/menu";
const UNSAFE_PATH_CHARACTERS = /[\\\u0000-\u001f\u007f]/;

/** Resolve an untrusted auth return target to a safe same-origin relative path. */
export function resolveAuthReturnTarget(target: string | null): string {
  if (!target || !target.startsWith("/") || target.startsWith("//") || UNSAFE_PATH_CHARACTERS.test(target)) {
    return FALLBACK_AUTH_TARGET;
  }

  try {
    const decoded = decodeURIComponent(target);
    if (UNSAFE_PATH_CHARACTERS.test(decoded)) return FALLBACK_AUTH_TARGET;
    const base = new URL("https://local.invalid");
    const resolved = new URL(target, base);
    if (resolved.origin !== base.origin) return FALLBACK_AUTH_TARGET;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return FALLBACK_AUTH_TARGET;
  }
}
