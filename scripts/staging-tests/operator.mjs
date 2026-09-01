import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { loadAttestation } from "./attestation.mjs";
import { validateTarget } from "./core.mjs";

const PROFILES = new Set(["plan", "smoke", "full", "recover"]);
const REQUIRED_ENV = [
  "PRODUCTION_BASE_URL", "TEST_STAGING_SUPABASE_REF", "NEXT_PUBLIC_SUPABASE_URL",
  "DATABASE_URL", "DIRECT_URL", "TEST_CUSTOMER_A_PHONE", "TEST_CUSTOMER_A_PASSWORD",
  "TEST_CUSTOMER_B_PHONE", "TEST_CUSTOMER_B_PASSWORD", "TEST_ADMIN_PHONE", "TEST_ADMIN_PASSWORD",
  "TEST_STAFF_PHONE", "TEST_STAFF_PASSWORD", "TEST_MAX_RUNTIME_MINUTES",
];
const NONSECRET_OVERLAY = ["TEST_VERCEL_PROJECT_ID", "TEST_VERCEL_TEAM_ID", "TEST_VERCEL_GIT_BRANCH",
  "TEST_STAGING_POOLER_HOST", "TEST_RELEASE_WINDOW_ID"];

function failure(code) { throw new Error(code); }
function sameIdentity(left, right) { return left.dev === right.dev && left.ino === right.ino; }

function rejectSymlinkComponents(target, fsImpl = fs) {
  const resolved = path.resolve(target);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  for (const component of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (fsImpl.existsSync(current) && fsImpl.lstatSync(current).isSymbolicLink()) {
      failure("OPERATOR_PATH_SYMLINK_FORBIDDEN");
    }
  }
}

function verifiedDirectory(directory, fsImpl = fs) {
  rejectSymlinkComponents(directory, fsImpl);
  const stat = fsImpl.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) failure("OPERATOR_CONFIG_DIRECTORY_UNSAFE");
  return fsImpl.realpathSync(directory);
}

/** Read one regular input through a single handle and reject replacement during the read. */
export function readVerifiedFile(file, fsImpl = fs) {
  const parent = path.dirname(file);
  rejectSymlinkComponents(parent, fsImpl);
  const parentBefore = verifiedDirectory(parent, fsImpl);
  let handle;
  try {
    handle = fsImpl.openSync(file, "r");
    const opened = fsImpl.fstatSync(handle, { bigint: true });
    const linked = fsImpl.lstatSync(file, { bigint: true });
    if (!opened.isFile() || linked.isSymbolicLink() || !sameIdentity(opened, linked)) {
      failure("OPERATOR_ENV_FILE_UNSAFE");
    }
    const contents = fsImpl.readFileSync(handle, "utf8");
    const after = fsImpl.lstatSync(file, { bigint: true });
    const parentAfter = verifiedDirectory(parent, fsImpl);
    if (!sameIdentity(opened, after) || parentBefore !== parentAfter) failure("OPERATOR_ENV_FILE_CHANGED");
    return contents;
  } catch (error) {
    if (/^OPERATOR_[A-Z0-9_]+$/.test(error?.message ?? "")) throw error;
    failure("OPERATOR_ENV_FILE_MISSING_OR_UNREADABLE");
  } finally {
    if (handle !== undefined) fsImpl.closeSync(handle);
  }
}

function configDirectory(cwd, source, fsImpl) {
  const configured = source.TEST_STAGING_CONFIG_DIR;
  if (configured !== undefined && configured !== "") {
    if (!path.isAbsolute(configured)) failure("OPERATOR_CONFIG_DIRECTORY_ABSOLUTE_REQUIRED");
    verifiedDirectory(configured, fsImpl);
    return configured;
  }
  verifiedDirectory(cwd, fsImpl);
  return cwd;
}

/** Load portable staging inputs from cwd or one explicit absolute external directory. */
export function loadOperatorEnvironment({ cwd = process.cwd(), source = process.env, fsImpl = fs } = {}) {
  const root = path.resolve(cwd);
  const directory = configDirectory(root, source, fsImpl);
  const stage = parse(readVerifiedFile(path.join(directory, ".env.staging"), fsImpl));
  const local = parse(readVerifiedFile(path.join(directory, ".env.staging.local"), fsImpl));
  const env = { ...stage, ...local };
  for (const key of NONSECRET_OVERLAY) {
    if (typeof source[key] === "string" && source[key].trim()) env[key] = source[key];
  }
  if (REQUIRED_ENV.some(key => typeof env[key] !== "string" || !env[key].trim())) {
    failure("OPERATOR_ENV_KEYS_MISSING");
  }
  return env;
}

function sessionDatabase(value, ref, host) {
  let url;
  try { url = new URL(value); } catch { failure("OPERATOR_DATABASE_URL_INVALID"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || decodeURIComponent(url.username) !== `postgres.${ref}`
    || !url.password || url.pathname !== "/postgres" || !/^(?:[a-z0-9-]+\.)?pooler\.supabase\.com$/.test(host ?? "")) {
    failure("OPERATOR_DATABASE_URL_INVALID");
  }
  url.hostname = host; url.port = "5432"; url.searchParams.delete("pgbouncer");
  url.searchParams.set("connection_limit", "1"); url.searchParams.set("connect_timeout", "15");
  url.searchParams.set("pool_timeout", "30");
  return url.toString();
}

/** Overlay one current attestation as the only live deployment target for a profile. */
export function loadProfileEnvironment({ cwd = process.cwd(), profile, source = process.env, fsImpl = fs } = {}) {
  const base = loadOperatorEnvironment({ cwd, source, fsImpl });
  const attestation = loadAttestation(path.join(cwd, ".staging-test-runs"));
  if (attestation.projectId !== base.TEST_VERCEL_PROJECT_ID || attestation.teamId !== base.TEST_VERCEL_TEAM_ID
    || attestation.branch !== base.TEST_VERCEL_GIT_BRANCH || attestation.supabaseRef !== base.TEST_STAGING_SUPABASE_REF
    || attestation.poolerHost !== base.TEST_STAGING_POOLER_HOST
    || attestation.releaseWindowAssertion?.id !== base.TEST_RELEASE_WINDOW_ID
    || attestation.releaseWindowAssertion?.assertedByOperator !== true) failure("OPERATOR_ATTESTATION_PIN_MISMATCH");
  const databaseUrl = sessionDatabase(base.DIRECT_URL, attestation.supabaseRef, attestation.poolerHost);
  const env = { ...base, TEST_BASE_URL: attestation.deploymentOrigin, TEST_DEPLOYMENT_ID: attestation.deploymentId,
    TEST_DEPLOYMENT_SHA: attestation.deploymentSha, NEXT_PUBLIC_APP_ENV: "staging", VERCEL_ENV: "preview",
    DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl };
  if (!validateTarget(env, attestation, profile !== "plan").ok) failure("OPERATOR_ATTESTATION_INVALID");
  return env;
}

/** Launch an unchanged staging CLI profile without a shell or secret-bearing arguments. */
export function launchProfile({ cwd = process.cwd(), profile, args = [], spawn = spawnSync,
  source = process.env, fsImpl = fs }) {
  if (!PROFILES.has(profile)) failure("OPERATOR_PROFILE_INVALID");
  if (!Array.isArray(args) || args.some(value => typeof value !== "string")) failure("OPERATOR_ARGUMENTS_INVALID");
  const env = loadProfileEnvironment({ cwd, profile, source, fsImpl });
  const result = spawn(process.execPath, [path.join(cwd, "scripts/staging-tests/cli.mjs"), profile, ...args], {
    cwd, env: { ...process.env, ...env }, stdio: "inherit", windowsHide: true,
  });
  if (result.error) failure("OPERATOR_PROFILE_LAUNCH_FAILED");
  return result.status ?? 1;
}

/** Route operator profile commands without printing configuration values. */
export function operatorMain(argv = process.argv.slice(2)) {
  const [profile, ...args] = argv;
  return launchProfile({ profile, args });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = operatorMain(); }
  catch (error) {
    const code = /^[A-Z0-9_]{1,80}$/.test(error?.message ?? "") ? error.message : "OPERATOR_FAILED";
    console.error(code);
    process.exitCode = 1;
  }
}
