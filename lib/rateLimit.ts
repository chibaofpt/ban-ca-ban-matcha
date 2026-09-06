import { captureServerException } from "@/lib/observability";
import { getRedisClient } from "@/lib/redis";
import {
  RATE_LIMIT_RULES,
  resolveAuthRateLimitRule,
  type RateLimitRuleName,
} from "@/lib/rateLimitConfig";
export { getClientIp } from "@/lib/clientIp";

interface RateLimitRedis {
  get(key: string): Promise<number | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  del(key: string): Promise<number>;
}

/** Result returned by every configured rate limit check. */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** One configured limiter check in a shared multi-limit policy. */
export interface RateLimitCheck {
  ruleName: RateLimitRuleName;
  identifier: string;
}

/** Aggregate limiter results with a deterministic maximum Retry-After. */
export function aggregateRateLimitResults(results: RateLimitResult[]): RateLimitResult {
  const blocked = results.filter((result) => !result.allowed);
  if (blocked.length === 0) {
    return {
      allowed: true,
      remaining: Math.min(...results.map((result) => result.remaining)),
      retryAfterSeconds: 0,
    };
  }
  return {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: Math.max(...blocked.map((result) => result.retryAfterSeconds)),
  };
}

/** Supported login identifiers for the distributed credential flood guard. */
export type LoginIdentifierKind = "phone" | "instagram";

function redisClient(): RateLimitRedis | null {
  return getRedisClient() as unknown as RateLimitRedis | null;
}

function reportRateLimitFailure(operation: string, rule: RateLimitRuleName): void {
  captureServerException(new Error("RATE_LIMIT_UPSTREAM_FAILURE"), {
    operation,
    rule,
    code: "REDIS_OPERATION_FAILED",
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

/** HMAC an identifier before it is used in an external Redis key. */
export async function hashRateLimitIdentifier(
  scope: string,
  identifier: string,
): Promise<string> {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is required");

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${scope}:${identifier}`),
  );
  return bytesToHex(new Uint8Array(signature));
}

/** Resolve whether an auth request should consume the shared mutation limiter. */
export function getAuthRateLimitRule(
  method: string,
  pathname: string,
): RateLimitRuleName | null {
  return resolveAuthRateLimitRule(method, pathname);
}

/** Execute a low-command fixed-window counter and fail open on Redis errors. */
export async function checkRateLimit(
  ruleName: RateLimitRuleName,
  identifier: string,
): Promise<RateLimitResult> {
  const client = redisClient();
  if (!client) return { allowed: true, remaining: -1, retryAfterSeconds: 0 };

  const rule = RATE_LIMIT_RULES[ruleName];
  try {
    const digest = await hashRateLimitIdentifier(ruleName, identifier);
    const key = `${rule.prefix}:${digest}`;
    const count = Number(await client.incr(key));

    if (count === 1) await client.expire(key, rule.windowSeconds);

    const allowed = count <= rule.limit;
    const retryAfterSeconds = allowed
      ? 0
      : Math.max(1, Number(await client.ttl(key)) || rule.windowSeconds);

    return {
      allowed,
      remaining: allowed ? Math.max(0, rule.limit - count) : 0,
      retryAfterSeconds,
    };
  } catch (error) {
    reportRateLimitFailure("rate_limit", ruleName);
    return { allowed: true, remaining: -1, retryAfterSeconds: 0 };
  }
}

/** Execute every required limiter in a shared policy and aggregate the result. */
export async function checkRateLimits(checks: RateLimitCheck[]): Promise<RateLimitResult> {
  const results = await Promise.all(
    checks.map(({ ruleName, identifier }) => checkRateLimit(ruleName, identifier)),
  );
  return aggregateRateLimitResults(results);
}

/** Backward-compatible auth mutation limiter wrapper. */
export async function checkDistributedRateLimit(
  identifier: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const result = await checkRateLimit("authMutationIp", identifier);
  return { allowed: result.allowed, remaining: result.remaining };
}

async function loginCounterKey(
  ruleName: "loginFailedIp" | "loginIdentifier",
  identifier: string,
): Promise<string> {
  const digest = await hashRateLimitIdentifier(ruleName, identifier);
  return `${RATE_LIMIT_RULES[ruleName].prefix}:${digest}`;
}

async function readLoginCounter(
  ruleName: "loginFailedIp" | "loginIdentifier",
  identifier: string,
): Promise<number | null> {
  const client = redisClient();
  if (!client) return null;
  return Number(await client.get(await loginCounterKey(ruleName, identifier))) || 0;
}

async function recordLoginCounter(
  ruleName: "loginFailedIp" | "loginIdentifier",
  identifier: string,
): Promise<void> {
  const client = redisClient();
  if (!client) return;
  const key = await loginCounterKey(ruleName, identifier);
  const count = Number(await client.incr(key));
  if (count === 1) await client.expire(key, RATE_LIMIT_RULES[ruleName].windowSeconds);
}

async function resetLoginCounter(
  ruleName: "loginFailedIp" | "loginIdentifier",
  identifier: string,
): Promise<void> {
  const client = redisClient();
  if (!client) return;
  await client.del(await loginCounterKey(ruleName, identifier));
}

/** Check the failed-login IP counter. */
export async function checkLoginFailLimit(
  ip: string,
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const count = await readLoginCounter("loginFailedIp", ip);
    if (count === null) return { allowed: true, remaining: -1 };
    const limit = RATE_LIMIT_RULES.loginFailedIp.limit;
    return {
      allowed: count < limit,
      remaining: count < limit ? limit - count : 0,
    };
  } catch (error) {
    reportRateLimitFailure("login_rate_limit", "loginFailedIp");
    return { allowed: true, remaining: -1 };
  }
}

/** Record one invalid credential attempt for an IP. */
export async function recordLoginFail(ip: string): Promise<void> {
  try {
    await recordLoginCounter("loginFailedIp", ip);
  } catch (error) {
    reportRateLimitFailure("login_rate_limit", "loginFailedIp");
  }
}

/** Clear the invalid credential counter for an IP. */
export async function resetLoginFail(ip: string): Promise<void> {
  try {
    await resetLoginCounter("loginFailedIp", ip);
  } catch (error) {
    reportRateLimitFailure("login_rate_limit", "loginFailedIp");
  }
}

/** Check the distributed failed-login counter for a normalized identifier. */
export async function checkIdentifierFloodGuard(
  kind: LoginIdentifierKind,
  identifier: string,
): Promise<{ allowed: boolean }> {
  try {
    const count = await readLoginCounter("loginIdentifier", `${kind}:${identifier}`);
    if (count === null) return { allowed: true };
    return { allowed: count < RATE_LIMIT_RULES.loginIdentifier.limit };
  } catch (error) {
    reportRateLimitFailure("login_rate_limit", "loginIdentifier");
    return { allowed: true };
  }
}

/** Record one invalid credential attempt for a normalized identifier. */
export async function recordIdentifierFloodAttempt(
  kind: LoginIdentifierKind,
  identifier: string,
): Promise<void> {
  try {
    await recordLoginCounter("loginIdentifier", `${kind}:${identifier}`);
  } catch (error) {
    reportRateLimitFailure("login_rate_limit", "loginIdentifier");
  }
}

/** Clear the failed-login counter for a normalized identifier. */
export async function resetIdentifierFlood(
  kind: LoginIdentifierKind,
  identifier: string,
): Promise<void> {
  try {
    await resetLoginCounter("loginIdentifier", `${kind}:${identifier}`);
  } catch (error) {
    reportRateLimitFailure("login_rate_limit", "loginIdentifier");
  }
}

/** Backward-compatible phone flood check wrapper. */
export async function checkPhoneFloodGuard(phone: string): Promise<{ allowed: boolean }> {
  return checkIdentifierFloodGuard("phone", phone);
}

/** Backward-compatible phone flood increment wrapper. */
export async function recordPhoneFloodAttempt(phone: string): Promise<void> {
  return recordIdentifierFloodAttempt("phone", phone);
}

/** Backward-compatible phone flood reset wrapper. */
export async function resetPhoneFlood(phone: string): Promise<void> {
  return resetIdentifierFlood("phone", phone);
}
