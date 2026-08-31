import fs from "node:fs";
import path from "node:path";

const DATABASE_KEYS = ["DATABASE_URL", "DIRECT_URL"];
const READABLE_KEYS = ["NEXT_PUBLIC_APP_ENV", "NEXT_PUBLIC_SUPABASE_URL", "PUSH_DELIVERY_MODE"];

function failure(code) { throw new Error(code); }
function assert(value, code) { if (!value) failure(code); }
async function boundary(operation, code) {
  try { return await operation(); }
  catch (error) {
    if (/^CONFIGURE_[A-Z0-9_]+$/.test(error?.message ?? "")) throw error;
    failure(code);
  }
}

function databaseValue(value, ref, host, port, transactionPooler) {
  let url;
  try { url = new URL(value); } catch { failure("CONFIGURE_DATABASE_URL_INVALID"); }
  assert(["postgres:", "postgresql:"].includes(url.protocol)
    && decodeURIComponent(url.username) === `postgres.${ref}` && url.password
    && url.pathname === "/postgres", "CONFIGURE_DATABASE_IDENTITY_INVALID");
  url.hostname = host;
  url.port = String(port);
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("connect_timeout", "10");
  url.searchParams.set("pool_timeout", "10");
  url.searchParams.delete("pgbouncer");
  if (transactionPooler) url.searchParams.set("pgbouncer", "true");
  return url.toString();
}

function rejectSymlinkComponents(target, fsImpl) {
  const resolved = path.resolve(target);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  for (const component of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (fsImpl.existsSync(current) && fsImpl.lstatSync(current).isSymbolicLink()) {
      failure("CONFIGURE_RUN_ROOT_UNSAFE");
    }
  }
}

function safeRunRoot(cwd, fsImpl) {
  const root = path.join(path.resolve(cwd), ".staging-test-runs");
  rejectSymlinkComponents(root, fsImpl);
  fsImpl.mkdirSync(root, { recursive: true, mode: 0o700 });
  rejectSymlinkComponents(root, fsImpl);
  const stat = fsImpl.lstatSync(root);
  assert(stat.isDirectory() && !stat.isSymbolicLink(), "CONFIGURE_RUN_ROOT_UNSAFE");
  return root;
}

/** Open one verified append journal and transfer handle ownership only on success. */
export function openJournal(file, runRoot, fsImpl = fs) {
  if (fsImpl.existsSync(file) && fsImpl.lstatSync(file).isSymbolicLink()) failure("CONFIGURE_JOURNAL_UNSAFE");
  const noFollow = fsImpl.constants.O_NOFOLLOW ?? 0;
  const flags = fsImpl.constants.O_APPEND | fsImpl.constants.O_CREAT | fsImpl.constants.O_RDWR | noFollow;
  const handle = fsImpl.openSync(file, flags, 0o600);
  try {
    const opened = fsImpl.fstatSync(handle);
    const linked = fsImpl.lstatSync(file);
    if (!opened.isFile() || linked.isSymbolicLink() || opened.dev !== linked.dev || opened.ino !== linked.ino
      || fsImpl.realpathSync(path.dirname(file)) !== fsImpl.realpathSync(runRoot)) {
      failure("CONFIGURE_JOURNAL_UNSAFE");
    }
    return handle;
  } catch (error) {
    fsImpl.closeSync(handle);
    throw error;
  }
}

function appendDurable(file, runRoot, handle, event, fsImpl) {
  const opened = fsImpl.fstatSync(handle);
  const linked = fsImpl.lstatSync(file);
  assert(!linked.isSymbolicLink() && linked.isFile() && opened.dev === linked.dev && opened.ino === linked.ino
    && fsImpl.realpathSync(path.dirname(file)) === fsImpl.realpathSync(runRoot), "CONFIGURE_JOURNAL_UNSAFE");
  fsImpl.writeSync(handle, `${JSON.stringify(event)}\n`);
  fsImpl.fsyncSync(handle);
  const after = fsImpl.lstatSync(file);
  assert(after.dev === opened.dev && after.ino === opened.ino, "CONFIGURE_JOURNAL_UNSAFE");
}

function atomicJson(file, value, fsImpl) {
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fsImpl.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    fsImpl.renameSync(temporary, file);
  } finally { if (fsImpl.existsSync(temporary)) fsImpl.rmSync(temporary); }
}

function inventoryRows(response) {
  assert(Array.isArray(response?.envs) && !response.pagination?.next, "CONFIGURE_ENV_INVENTORY_INCOMPLETE");
  return response.envs;
}

function branchRow(rows, key, branch) {
  const matches = rows.filter(row => row.key === key && row.gitBranch === branch);
  assert(matches.length <= 1, "CONFIGURE_BRANCH_ENV_AMBIGUOUS");
  const selected = matches[0] ?? null;
  if (selected) assert(selected.target?.length === 1 && selected.target[0] === "preview"
    && !selected.customEnvironmentIds?.length, "CONFIGURE_BRANCH_ENV_SCOPE_INVALID");
  return selected;
}

function readableRow(rows, key, branch) {
  const candidates = rows.filter(row => row.key === key && row.target?.includes("preview")
    && !row.customEnvironmentIds?.length);
  const overrides = candidates.filter(row => row.gitBranch === branch);
  const effective = overrides.length ? overrides : candidates.filter(row => !row.gitBranch);
  assert(effective.length === 1, "CONFIGURE_READABLE_CONFIG_AMBIGUOUS");
  return effective[0];
}

function metadata(row) {
  return { id: row.id, key: row.key, type: row.type, target: row.target, gitBranch: row.gitBranch,
    createdAt: row.createdAt, updatedAt: row.updatedAt, customEnvironmentIds: row.customEnvironmentIds ?? [] };
}

function validMutationRow(row, key, branch) {
  return row?.id && row.key === key && row.type === "sensitive" && row.gitBranch === branch
    && row.target?.length === 1 && row.target[0] === "preview" && !row.customEnvironmentIds?.length
    && row.updatedAt != null;
}

/** Configure exact-branch sensitive database variables and emit only non-secret provenance. */
export async function configureStagingDatabase({ cwd = process.cwd(), branch, env, git, vercel,
  fsImpl = fs, now = () => new Date().toISOString() }) {
  assert(typeof branch === "string" && branch.length > 0, "CONFIGURE_BRANCH_REQUIRED");
  assert(!["main", "master", "production"].includes(branch.toLowerCase()), "CONFIGURE_BRANCH_FORBIDDEN");
  assert([env.TEST_VERCEL_GIT_BRANCH, env.TEST_VERCEL_PROJECT_ID, env.TEST_VERCEL_TEAM_ID, env.TEST_RELEASE_WINDOW_ID]
    .every(value => typeof value === "string" && value.trim()), "CONFIGURE_IMMUTABLE_PIN_MISSING");
  assert(env.TEST_VERCEL_GIT_BRANCH === branch, "CONFIGURE_BRANCH_NOT_ALLOWED");
  assert(await boundary(() => git.currentBranch(), "CONFIGURE_GIT_COMMAND_FAILED") === branch,
    "CONFIGURE_GIT_BRANCH_MISMATCH");
  assert(env.NEXT_PUBLIC_APP_ENV === "staging", "CONFIGURE_APP_ENV_INVALID");
  const ref = env.TEST_STAGING_SUPABASE_REF?.trim().toLowerCase();
  assert(ref && env.NEXT_PUBLIC_SUPABASE_URL === `https://${ref}.supabase.co`, "CONFIGURE_SUPABASE_IDENTITY_INVALID");
  const host = env.TEST_STAGING_POOLER_HOST?.trim().toLowerCase();
  assert(/^(?:[a-z0-9-]+\.)?pooler\.supabase\.com$/.test(host ?? ""), "CONFIGURE_POOLER_HOST_INVALID");
  const linkage = await boundary(() => vercel.linkage(), "CONFIGURE_LINKAGE_READ_FAILED");
  assert(linkage?.projectId && linkage?.teamId, "CONFIGURE_VERCEL_LINKAGE_MISSING");
  assert(env.TEST_VERCEL_PROJECT_ID === linkage.projectId, "CONFIGURE_PROJECT_MISMATCH");
  assert(env.TEST_VERCEL_TEAM_ID === linkage.teamId, "CONFIGURE_TEAM_MISMATCH");
  const project = await boundary(() => vercel.project({ projectId: linkage.projectId, teamId: linkage.teamId }),
    "CONFIGURE_PROJECT_READ_FAILED");
  assert(project?.id === linkage.projectId && project?.accountId === linkage.teamId
    && project?.autoExposeSystemEnvs === true, "CONFIGURE_PROJECT_IDENTITY_INVALID");
  const values = {
    DATABASE_URL: databaseValue(env.DATABASE_URL, ref, host, 6543, true),
    DIRECT_URL: databaseValue(env.DIRECT_URL, ref, host, 5432, false),
  };
  const runRoot = safeRunRoot(cwd, fsImpl);
  const proofFile = path.join(runRoot, "deployment-environment-proof.json");
  if (fsImpl.existsSync(proofFile)) fsImpl.rmSync(proofFile);
  const journal = path.join(runRoot, "deployment-environment-configuration.ndjson");
  const journalFd = openJournal(journal, runRoot, fsImpl);
  try {
  const inventory = () => boundary(() => vercel.inventory({ projectId: linkage.projectId, teamId: linkage.teamId }),
    "CONFIGURE_INVENTORY_READ_FAILED");
  let rows = inventoryRows(await inventory());
  for (const key of DATABASE_KEYS) {
    const existing = branchRow(rows, key, branch);
    appendDurable(journal, runRoot, journalFd, { at: now(), kind: "INTENT", key, projectId: linkage.projectId,
      teamId: linkage.teamId, branch, target: ["preview"] }, fsImpl);
    const response = await boundary(() => vercel.upsertSensitive({ projectId: linkage.projectId, teamId: linkage.teamId, branch,
      key, value: values[key], existingId: existing?.id ?? null }), "CONFIGURE_MUTATION_FAILED");
    assert(validMutationRow(response, key, branch), "CONFIGURE_MUTATION_RESPONSE_INVALID");
    rows = inventoryRows(await inventory());
    const applied = branchRow(rows, key, branch);
    assert(applied?.type === "sensitive", "CONFIGURE_SENSITIVE_ENV_NOT_APPLIED");
    assert(applied.id === response.id && applied.updatedAt === response.updatedAt,
      "CONFIGURE_MUTATION_RESPONSE_INVALID");
    appendDurable(journal, runRoot, journalFd, { at: now(), kind: "APPLIED", key, metadata: metadata(applied) }, fsImpl);
  }
  const configured = Object.fromEntries(DATABASE_KEYS.map(key => [key, metadata(branchRow(rows, key, branch))]));
  const readable = await boundary(() => vercel.readableConfig({ projectId: linkage.projectId,
    teamId: linkage.teamId, branch }), "CONFIGURE_READABLE_CONFIG_READ_FAILED");
  assert(readable?.values?.NEXT_PUBLIC_APP_ENV === "staging"
    && readable.values.NEXT_PUBLIC_SUPABASE_URL === `https://${ref}.supabase.co`
    && readable.values.PUSH_DELIVERY_MODE === "log_only", "CONFIGURE_READABLE_CONFIG_INVALID");
  const readableRows = inventoryRows({ envs: readable.rows, pagination: readable.pagination });
  const readableMetadata = Object.fromEntries(READABLE_KEYS.map(key => {
    return [key, metadata(readableRow(readableRows, key, branch))];
  }));
  const proof = { projectId: linkage.projectId, teamId: linkage.teamId, branch, supabaseRef: ref,
    poolerHost: host, releaseWindowId: env.TEST_RELEASE_WINDOW_ID, configuredAt: now(), databaseVariables: configured, readableVariables: readableMetadata,
    readableClaims: { appEnvironment: "staging", supabaseUrlMatchesRef: true, pushMode: "log_only" },
    systemEnvExposure: true, deploymentSecretReadback: false,
    proofMode: "configured-sensitive-branch-variables-awaiting-fresh-git-deployment" };
  atomicJson(proofFile, proof, fsImpl);
  return { status: "PASS", proofFile, proof };
  } finally { fsImpl.closeSync(journalFd); }
}
