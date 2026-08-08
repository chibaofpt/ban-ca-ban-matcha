/** Names of every application-level rate limit rule. */
export type RateLimitRuleName = keyof typeof RATE_LIMIT_RULES;

/** Central catalog of rate limit thresholds, windows, and Redis prefixes. */
export const RATE_LIMIT_RULES = {
  authMutationIp: {
    limit: 10,
    windowSeconds: 60,
    prefix: "rl:v1:auth:mutation-ip",
    algorithm: "fixed-window",
  },
  loginFailedIp: {
    limit: 5,
    windowSeconds: 15 * 60,
    prefix: "rl:v1:auth:login-failed-ip",
    algorithm: "fixed-window",
  },
  loginIdentifier: {
    limit: 10,
    windowSeconds: 15 * 60,
    prefix: "rl:v1:auth:login-identifier",
    algorithm: "fixed-window",
  },
  customerOrderUser: {
    limit: 5,
    windowSeconds: 10 * 60,
    prefix: "rl:v1:order:customer:user",
    algorithm: "fixed-window",
  },
  customerOrderIp: {
    limit: 50,
    windowSeconds: 10 * 60,
    prefix: "rl:v1:order:customer:ip",
    algorithm: "fixed-window",
  },
  staffOrderAccount: {
    limit: 30,
    windowSeconds: 60,
    prefix: "rl:v1:order:staff:account",
    algorithm: "fixed-window",
  },
  voucherExchangeAccount: {
    limit: 5,
    windowSeconds: 60,
    prefix: "rl:v1:voucher:exchange:account",
    algorithm: "fixed-window",
  },
  pushMutationAccount: {
    limit: 20,
    windowSeconds: 10 * 60,
    prefix: "rl:v1:push:mutation:account",
    algorithm: "fixed-window",
  },
  deliveryAccount: {
    limit: 60,
    windowSeconds: 60,
    prefix: "rl:v1:delivery:account",
    algorithm: "fixed-window",
  },
  deliveryIp: {
    limit: 120,
    windowSeconds: 60,
    prefix: "rl:v1:delivery:ip",
    algorithm: "fixed-window",
  },
} as const;

const AUTH_MUTATION_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/check-phone",
  "/api/auth/refresh",
]);

/** Resolve an auth request to its configured rule, excluding reads and logout. */
export function resolveAuthRateLimitRule(
  method: string,
  pathname: string,
): RateLimitRuleName | null {
  return method.toUpperCase() === "POST" && AUTH_MUTATION_PATHS.has(pathname)
    ? "authMutationIp"
    : null;
}
