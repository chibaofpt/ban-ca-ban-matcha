import { z } from "zod";

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function hasDecodedLength(value: string, length: number, firstByte?: number): boolean {
  if (value.length > Math.ceil(length * 4 / 3) || !BASE64URL.test(value)) return false;
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.length === length && (firstByte === undefined || decoded[0] === firstByte);
  } catch {
    return false;
  }
}

/** Validate a browser push service endpoint without permitting arbitrary outbound hosts. */
export function isAllowedPushEndpoint(value: string): boolean {
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return false;
    if (url.port && url.port !== "443") return false;
    const host = url.hostname.toLowerCase();
    return host === "fcm.googleapis.com"
      || host === "updates.push.services.mozilla.com"
      || host.endsWith(".push.apple.com")
      || host.endsWith(".notify.windows.com");
  } catch {
    return false;
  }
}

const endpointSchema = z.string().refine(isAllowedPushEndpoint);

export const subscribeSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({
    p256dh: z.string().refine((value) => hasDecodedLength(value, 65, 4)),
    auth: z.string().refine((value) => hasDecodedLength(value, 16)),
  }),
});

export const unsubscribeSchema = z.object({
  endpoint: endpointSchema,
});
