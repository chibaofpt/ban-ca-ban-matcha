const STATUS_RANK = { PASS: 0, PARTIAL: 1, FAIL: 2 };
const SECRET_KEY = /(password|cookie|authorization|database_url|direct_url|secret|token|qr_token|user_id|voucher_id)/i;
const RUN_ID = /^[a-z0-9][a-z0-9_-]{7,63}$/;

function parseHttpsOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

function supabaseRef(value) {
  try {
    return new URL(value).hostname.toLowerCase().match(/^([a-z0-9-]+)\.supabase\.co$/)?.[1] ?? null;
  } catch { return null; }
}

function databaseIdentity(value) {
  try {
    const url = new URL(value);
    if (!["postgresql:", "postgres:"].includes(url.protocol)) return null;
    return { host: url.hostname.toLowerCase(), user: decodeURIComponent(url.username).toLowerCase() };
  } catch { return null; }
}

function databaseMatches(value, ref) {
  const db = databaseIdentity(value);
  if (!db || !ref) return false;
  return db.host === `db.${ref}.supabase.co`
    || (/^(?:[a-z0-9-]+\.)?pooler\.supabase\.com$/.test(db.host) && db.user.endsWith(`.${ref}`));
}

/** Validate local configuration before any network or database access. */
export function validateStaticTarget(env) {
  const errors = [];
  if (env.NEXT_PUBLIC_APP_ENV !== "staging") errors.push("NEXT_PUBLIC_APP_ENV must equal staging");
  if (env.VERCEL_ENV !== "preview") errors.push("VERCEL_ENV must equal preview");
  const apiOrigin = parseHttpsOrigin(env.TEST_BASE_URL ?? "");
  if (!apiOrigin) errors.push("TEST_BASE_URL must be a credential-free HTTPS origin");
  const productionOrigin = parseHttpsOrigin(env.PRODUCTION_BASE_URL ?? "");
  if (!productionOrigin) errors.push("PRODUCTION_BASE_URL must be a credential-free HTTPS origin");
  if (apiOrigin && productionOrigin && apiOrigin === productionOrigin) errors.push("TEST_BASE_URL must not equal production origin");
  const expectedRef = env.TEST_STAGING_SUPABASE_REF?.trim().toLowerCase();
  if (!expectedRef) errors.push("TEST_STAGING_SUPABASE_REF is required");
  if (supabaseRef(env.NEXT_PUBLIC_SUPABASE_URL ?? "") !== expectedRef) errors.push("Supabase URL must match staging ref");
  if (!databaseMatches(env.DATABASE_URL ?? "", expectedRef)) errors.push("Database host or user must match staging ref");
  if (env.DIRECT_URL) {
    if (!databaseMatches(env.DIRECT_URL, expectedRef)) errors.push("Direct database host or user must match staging ref");
  }
  if (!env.TEST_DEPLOYMENT_ID) errors.push("TEST_DEPLOYMENT_ID is required");
  if (!env.TEST_DEPLOYMENT_SHA) errors.push("TEST_DEPLOYMENT_SHA is required");
  return { ok: errors.length === 0, errors, apiOrigin, expectedRef };
}

/** Validate that runtime evidence identifies one safe staging dataset. */
export function validateTarget(env, evidence = {}, requirePushSandbox = false) {
  const staticResult = validateStaticTarget(env);
  const errors = [...staticResult.errors];
  const { apiOrigin, expectedRef } = staticResult;
  if (!expectedRef || evidence.supabaseRef !== expectedRef) errors.push("Control-plane Supabase ref must match staging ref");
  const binding = evidence.databaseBinding;
  if (binding?.verified !== true || binding.source !== "deployment-environment"
    || binding.supabaseRef !== expectedRef || binding.deploymentId !== env.TEST_DEPLOYMENT_ID
    || binding.deploymentSha !== env.TEST_DEPLOYMENT_SHA) {
    errors.push("Deployment DATABASE_URL binding must be verified through the control plane");
  }
  if (!evidence.apiDatabaseFingerprint || evidence.apiDatabaseFingerprint !== evidence.databaseFingerprint) {
    errors.push("API and database catalog fingerprints must match");
  }
  if (!env.TEST_DEPLOYMENT_ID || evidence.deploymentId !== env.TEST_DEPLOYMENT_ID) errors.push("Deployment id attestation is missing or mismatched");
  if (!env.TEST_DEPLOYMENT_SHA || evidence.deploymentSha !== env.TEST_DEPLOYMENT_SHA) errors.push("Deployment SHA attestation is missing or mismatched");
  if (!["vercel-mcp", "vercel-api"].includes(evidence.source) || evidence.environment !== "preview"
    || evidence.appEnvironment !== "staging" || evidence.deploymentOrigin !== apiOrigin
    || !apiOrigin?.endsWith(".vercel.app") || evidence.immutableDeployment !== true) errors.push("Control-plane target does not identify this staging deployment");
  const verified = Date.parse(evidence.verifiedAt ?? "");
  const expires = Date.parse(evidence.expiresAt ?? "");
  if (!Number.isFinite(verified) || !Number.isFinite(expires) || verified > Date.now() + 60_000
    || expires <= Date.now() || expires - verified > 2 * 60 * 60_000) errors.push("Control-plane attestation is stale or invalid");
  if (requirePushSandbox && (evidence.pushMode !== "log_only" || evidence.pushGuardVerified !== true)) {
    errors.push("Verified staging log_only push mode is required for writes");
  }
  return { ok: errors.length === 0, errors, apiOrigin, expectedRef };
}

/** Remove secrets and recovery identifiers from report-safe values. */
export function redact(value, key = "") {
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([itemKey, item]) => [itemKey, redact(item, itemKey)]));
  if (typeof value === "string") {
    try { new URL(value); return "[REDACTED]"; } catch { /* not a URL */ }
  }
  return value;
}

/** Return the most severe outcome, where FAIL overrides PARTIAL. */
export function combineStatus(statuses) {
  return statuses.reduce((worst, status) => STATUS_RANK[status] > STATUS_RANK[worst] ? status : worst, "PASS");
}

/** Map a runner outcome to its documented process exit code. */
export function statusExitCode(status) { return status === "PASS" ? 0 : status === "FAIL" ? 1 : 2; }

/** Validate an exact local run id without accepting paths or wildcards. */
export function validateRunId(runId) {
  if (!RUN_ID.test(runId)) throw new Error("Invalid exact run id");
  return runId;
}
