import fs from "node:fs";
import path from "node:path";
import { readVerifiedFile } from "./operator.mjs";
import { validateTarget } from "./core.mjs";
import { createApi } from "./http.mjs";
import { publicCatalogFingerprintFromApi, publicCatalogFingerprintFromDatabase } from "./fingerprints.mjs";

const PUSH_BLOB = "096a5cd881d78368912eb5c34559b02bad8edb42";
const DB_KEYS = ["DATABASE_URL", "DIRECT_URL"];
const READABLE_KEYS = ["NEXT_PUBLIC_APP_ENV", "NEXT_PUBLIC_SUPABASE_URL", "PUSH_DELIVERY_MODE"];
const PROTECTED_KEYS = [...DB_KEYS, ...READABLE_KEYS, "VERCEL_ENV"];
function failure(code) { throw new Error(code); }
function assert(value, code) { if (!value) failure(code); }
function millis(value) { const parsed = typeof value === "number" ? value : Date.parse(value); return Number.isFinite(parsed) ? parsed : NaN; }

function metadata(row) {
  return { id: row.id, key: row.key, type: row.type, target: row.target, gitBranch: row.gitBranch,
    createdAt: row.createdAt, updatedAt: row.updatedAt, customEnvironmentIds: row.customEnvironmentIds ?? [] };
}

function rows(response) {
  assert(Array.isArray(response?.envs) && !response.pagination?.next, "ATTEST_ENV_INVENTORY_INCOMPLETE");
  return response.envs;
}

function exactRow(all, expected, branch) {
  const candidates = all.filter(row => row.key === expected.key && (expected.gitBranch
    ? row.gitBranch === branch : !row.gitBranch));
  assert(candidates.length === 1 && JSON.stringify(metadata(candidates[0])) === JSON.stringify(expected),
    "ATTEST_ENV_VERSION_CHANGED");
  return candidates[0];
}

function proofFile(cwd) { return path.join(cwd, ".staging-test-runs", "deployment-environment-proof.json"); }

function validateHistoricalAttestation(value, env, deploymentId, firstIntentAt) {
  const verified = Date.parse(value.verifiedAt);
  const expires = Date.parse(value.expiresAt);
  const intent = Date.parse(firstIntentAt);
  assert(Number.isFinite(verified) && Number.isFinite(expires) && Number.isFinite(intent)
    && expires > verified && expires - verified <= 2 * 60 * 60_000 && verified <= intent && intent <= expires,
  "ATTEST_HISTORICAL_WINDOW_INVALID");
  assert(!value.recoveryOnly && value.source === "vercel-api" && value.environment === "preview"
    && value.appEnvironment === "staging" && value.immutableDeployment === true
    && value.projectId === env.TEST_VERCEL_PROJECT_ID && value.teamId === env.TEST_VERCEL_TEAM_ID
    && value.branch === env.TEST_VERCEL_GIT_BRANCH && value.supabaseRef === env.TEST_STAGING_SUPABASE_REF
    && value.poolerHost === env.TEST_STAGING_POOLER_HOST && value.deploymentId === deploymentId
    && /^[0-9a-f]{40}$/.test(value.deploymentSha) && value.databaseBinding?.deploymentId === deploymentId
    && value.databaseBinding?.deploymentSha === value.deploymentSha
    && value.databaseBinding?.supabaseRef === value.supabaseRef
    && value.databaseBinding?.verified === true && value.databaseBinding?.source === "deployment-environment"
    && value.deploymentSecretReadback === false
    && value.databaseBinding?.proofMode === "accepted-sensitive-branch-configuration-and-fresh-git-source-deployment"
    && value.databaseBinding?.deploymentSecretReadback === false
    && value.databaseFingerprint && value.databaseFingerprint === value.apiDatabaseFingerprint
    && value.pushMode === "log_only" && value.pushGuardVerified === true
    && value.pushGuardEvidence?.reviewedBlob === PUSH_BLOB && value.pushGuardEvidence?.cleanTree === true
    && value.pushGuardEvidence?.source === "git"
    && value.provenanceMode === "vercel-classified-git+observed-configured-branch"
    && value.releaseWindowAssertion?.id === env.TEST_RELEASE_WINDOW_ID
    && value.releaseWindowAssertion?.assertedByOperator === true, "ATTEST_HISTORICAL_EVIDENCE_INVALID");
}

function preserveHistorical(runDir, bytes, fsImpl) {
  const runStat = fsImpl.lstatSync(runDir);
  assert(runStat.isDirectory() && !runStat.isSymbolicLink(), "ATTEST_RECOVERY_RUN_DIRECTORY_UNSAFE");
  const file = path.join(runDir, "historical-attestation.json");
  if (fsImpl.existsSync(file)) {
    assert(readVerifiedFile(file, fsImpl) === bytes, "ATTEST_HISTORICAL_ARCHIVE_CONFLICT");
    return file;
  }
  const temporary = `${file}.${process.pid}.tmp`;
  try { fsImpl.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 }); fsImpl.renameSync(temporary, file); }
  finally { if (fsImpl.existsSync(temporary)) fsImpl.rmSync(temporary); }
  assert(readVerifiedFile(file, fsImpl) === bytes, "ATTEST_HISTORICAL_ARCHIVE_INVALID");
  return file;
}

function invalidatePreviousAttestation(cwd, fsImpl) {
  const root = path.join(cwd, ".staging-test-runs");
  const rootStat = fsImpl.lstatSync(root);
  assert(rootStat.isDirectory() && !rootStat.isSymbolicLink(), "ATTEST_RUN_ROOT_UNSAFE");
  const file = path.join(root, "attestation.json");
  if (!fsImpl.existsSync(file)) return;
  const before = fsImpl.lstatSync(file);
  assert(before.isFile() && !before.isSymbolicLink(), "ATTEST_EXISTING_ARTIFACT_UNSAFE");
  const temporary = `${file}.${process.pid}.${Date.now()}.invalid`;
  const flags = fsImpl.constants.O_WRONLY | fsImpl.constants.O_CREAT | fsImpl.constants.O_EXCL
    | (fsImpl.constants.O_NOFOLLOW ?? 0);
  let descriptor;
  try {
    descriptor = fsImpl.openSync(temporary, flags, 0o600);
    fsImpl.writeSync(descriptor, `${JSON.stringify({ invalidated: true })}\n`);
    fsImpl.fsyncSync(descriptor);
    const marker = fsImpl.fstatSync(descriptor);
    assert(marker.isFile(), "ATTEST_EXISTING_ARTIFACT_UNSAFE");
    fsImpl.closeSync(descriptor); descriptor = undefined;
    fsImpl.renameSync(temporary, file);
    const installed = fsImpl.lstatSync(file);
    assert(installed.isFile() && !installed.isSymbolicLink() && installed.dev === marker.dev && installed.ino === marker.ino,
      "ATTEST_EXISTING_ARTIFACT_UNSAFE");
  } finally {
    if (descriptor !== undefined) fsImpl.closeSync(descriptor);
    if (fsImpl.existsSync(temporary)) fsImpl.rmSync(temporary);
  }
}

function loadProof(cwd, env, now) {
  let proof;
  try { proof = JSON.parse(readVerifiedFile(proofFile(cwd))); } catch { failure("ATTEST_CONFIGURATION_PROOF_INVALID"); }
  assert(proof.proofMode === "configured-sensitive-branch-variables-awaiting-fresh-git-deployment"
    && proof.deploymentSecretReadback === false && proof.projectId === env.TEST_VERCEL_PROJECT_ID
    && proof.teamId === env.TEST_VERCEL_TEAM_ID && proof.branch === env.TEST_VERCEL_GIT_BRANCH
    && proof.supabaseRef === env.TEST_STAGING_SUPABASE_REF && proof.poolerHost === env.TEST_STAGING_POOLER_HOST
    && proof.releaseWindowId === env.TEST_RELEASE_WINDOW_ID && typeof proof.releaseWindowId === "string" && proof.releaseWindowId,
  "ATTEST_CONFIGURATION_PROOF_MISMATCH");
  assert(DB_KEYS.every(key => proof.databaseVariables?.[key]?.key === key)
    && READABLE_KEYS.every(key => proof.readableVariables?.[key]?.key === key), "ATTEST_CONFIGURATION_PROOF_ROWS_INVALID");
  const configured = millis(proof.configuredAt);
  assert(Number.isFinite(configured) && configured <= now(), "ATTEST_CONFIGURATION_PROOF_TIME_INVALID");
  return { proof, configured };
}

function deploymentOrigin(value) {
  let url;
  try { url = new URL(`https://${value}`); } catch { failure("ATTEST_DEPLOYMENT_ORIGIN_INVALID"); }
  assert(url.protocol === "https:" && !url.username && !url.password && url.pathname === "/"
    && !url.search && !url.hash && url.hostname.endsWith(".vercel.app"), "ATTEST_DEPLOYMENT_ORIGIN_INVALID");
  return url.origin;
}

function sessionDatabase(value, ref, host) {
  let url;
  try { url = new URL(value); } catch { failure("ATTEST_LOCAL_DATABASE_INVALID"); }
  assert(["postgres:", "postgresql:"].includes(url.protocol) && decodeURIComponent(url.username) === `postgres.${ref}`
    && url.password && url.pathname === "/postgres", "ATTEST_LOCAL_DATABASE_INVALID");
  url.hostname = host; url.port = "5432"; url.searchParams.delete("pgbouncer");
  url.searchParams.set("connection_limit", "1"); url.searchParams.set("connect_timeout", "15");
  url.searchParams.set("pool_timeout", "30");
  return url.toString();
}

function checkInventory(response, proof) {
  const all = rows(response);
  for (const key of DB_KEYS) exactRow(all, proof.databaseVariables[key], proof.branch);
  for (const key of READABLE_KEYS) exactRow(all, proof.readableVariables[key], proof.branch);
}

function writeAttestation(cwd, evidence, fsImpl) {
  const root = path.join(cwd, ".staging-test-runs");
  const stat = fsImpl.lstatSync(root);
  assert(stat.isDirectory() && !stat.isSymbolicLink(), "ATTEST_RUN_ROOT_UNSAFE");
  const file = path.join(root, "attestation.json");
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fsImpl.writeFileSync(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    fsImpl.renameSync(temporary, file);
  } finally { if (fsImpl.existsSync(temporary)) fsImpl.rmSync(temporary); }
  return file;
}

/** Verify one explicit Git-integration deployment and issue a short-lived staging attestation. */
export async function attestStaging({ cwd = process.cwd(), deploymentId, env, git, vercel, openDatabase,
  fetchImpl = fetch, now = Date.now, fsImpl = fs, recoverRunId = "" }) {
  assert(/^dpl_[A-Za-z0-9]+$/.test(deploymentId ?? ""), "ATTEST_DEPLOYMENT_ID_INVALID");
  let historical;
  let recoveryState;
  let globalInvalidated = false;
  if (recoverRunId) {
    try {
      const globalFile = path.join(cwd, ".staging-test-runs", "attestation.json");
      const globalBytes = readVerifiedFile(globalFile, fsImpl);
      let exactInvalidMarker = false;
      let parsedGlobal;
      try {
        parsedGlobal = JSON.parse(globalBytes);
        exactInvalidMarker = parsedGlobal?.invalidated === true && Object.keys(parsedGlobal).length === 1;
      } catch { /* A malformed global artifact is not a trusted invalid marker. */ }
      invalidatePreviousAttestation(cwd, fsImpl); globalInvalidated = true;
      let bytes = globalBytes;
      let useArchive = exactInvalidMarker;
      if (parsedGlobal?.recoveryOnly) {
        assert(parsedGlobal.mode === "recovery-runner-descendant" && parsedGlobal.runId === recoverRunId
          && parsedGlobal.deploymentId === deploymentId && parsedGlobal.projectId === env.TEST_VERCEL_PROJECT_ID
          && parsedGlobal.teamId === env.TEST_VERCEL_TEAM_ID && parsedGlobal.branch === env.TEST_VERCEL_GIT_BRANCH
          && parsedGlobal.supabaseRef === env.TEST_STAGING_SUPABASE_REF
          && parsedGlobal.poolerHost === env.TEST_STAGING_POOLER_HOST
          && parsedGlobal.releaseWindowAssertion?.id === env.TEST_RELEASE_WINDOW_ID,
        "ATTEST_RECOVERY_GLOBAL_MISMATCH");
        useArchive = true;
      }
      const validRunId = /^run_[a-z0-9]{8,64}$/.test(recoverRunId);
      assert(validRunId, "ATTEST_RECOVERY_RUN_ID_INVALID");
      const runDir = path.join(cwd, ".staging-test-runs", recoverRunId);
      const stateRows = readVerifiedFile(path.join(runDir, "state.ndjson"), fsImpl).split("\n").filter(Boolean).map(JSON.parse);
      assert(stateRows[0]?.event === "INITIAL", "ATTEST_RECOVERY_STATE_INVALID");
      recoveryState = stateRows[0];
      if (parsedGlobal?.recoveryOnly) assert(recoveryState.target?.deploymentId === parsedGlobal.deploymentId
        && recoveryState.target?.origin === parsedGlobal.deploymentOrigin
        && recoveryState.target?.supabaseRef === parsedGlobal.supabaseRef, "ATTEST_RECOVERY_GLOBAL_MISMATCH");
      if (useArchive) bytes = readVerifiedFile(path.join(runDir, "historical-attestation.json"), fsImpl);
      const journal = readVerifiedFile(path.join(runDir, "journal.ndjson"), fsImpl).split("\n").filter(Boolean).map(JSON.parse);
      const firstIntent = journal.find(row => row.state === "INTENT");
      assert(firstIntent, "ATTEST_HISTORICAL_WINDOW_INVALID");
      historical = JSON.parse(bytes);
      validateHistoricalAttestation(historical, env, deploymentId, firstIntent.at);
      assert(recoveryState.target?.deploymentId === deploymentId
        && recoveryState.target?.origin === historical.deploymentOrigin
        && recoveryState.target?.supabaseRef === historical.supabaseRef, "ATTEST_RECOVERY_TARGET_MISMATCH");
      preserveHistorical(runDir, bytes, fsImpl);
    } catch (error) {
      if (/^ATTEST_/.test(error?.message ?? "")) throw error;
      if (/^OPERATOR_PATH_|^OPERATOR_CONFIG_DIRECTORY_UNSAFE/.test(error?.message ?? "")) {
        failure("ATTEST_RECOVERY_RUN_DIRECTORY_UNSAFE");
      }
      failure("ATTEST_HISTORICAL_EVIDENCE_INVALID");
    }
  }
  if (!globalInvalidated) invalidatePreviousAttestation(cwd, fsImpl);
  const { proof, configured } = loadProof(cwd, env, now);
  const branch = env.TEST_VERCEL_GIT_BRANCH;
  const [currentBranch, head, status, pushBlob, vercelSource, packageSource] = await Promise.all([
    git.currentBranch(), git.head(), git.status(), git.pushBlob(), git.trackedFile("vercel.json"), git.trackedFile("package.json"),
  ]);
  assert(currentBranch === branch, "ATTEST_GIT_BRANCH_MISMATCH");
  assert(/^[0-9a-f]{40}$/.test(head), "ATTEST_GIT_HEAD_INVALID");
  assert(status.trim() === "", "ATTEST_GIT_TREE_DIRTY");
  assert(pushBlob === PUSH_BLOB, "ATTEST_PUSH_BLOB_UNREVIEWED");
  const deployedSha = recoverRunId ? historical.deploymentSha : head;
  if (recoverRunId) {
    assert(deployedSha !== head && await git.isAncestor(deployedSha, head), "ATTEST_RUNNER_DESCENDANT_INVALID");
    const lines = (await git.diffNameStatus(deployedSha, head)).split("\n").filter(Boolean);
    assert(lines.length > 0 && lines.every(line => {
      const [status, file, extra] = line.split("\t");
      return !extra && /^[MA]$/.test(status) && (file.startsWith("scripts/staging-tests/")
        || /^lib\/__tests__\/staging-[^/]+\.test\.ts$/.test(file));
    }), "ATTEST_RUNNER_DIFF_UNSAFE");
    assert(await git.pushBlobAt(deployedSha) === PUSH_BLOB && await git.pushBlobAt(head) === PUSH_BLOB,
      "ATTEST_PUSH_BLOB_UNREVIEWED");
  }
  let vercelConfig;
  let packageConfig;
  try { vercelConfig = JSON.parse(vercelSource); packageConfig = JSON.parse(packageSource); }
  catch { failure("ATTEST_TRACKED_CONFIG_INVALID"); }
  const runtimeOverrides = { ...(vercelConfig.env ?? {}), ...(vercelConfig.build?.env ?? {}), ...(vercelConfig.buildEnv ?? {}) };
  assert(!PROTECTED_KEYS.some(key => Object.hasOwn(runtimeOverrides, key)), "ATTEST_TRACKED_RUNTIME_OVERRIDE");
  const protectedToken = new RegExp(`(?:${PROTECTED_KEYS.join("|")})`, "i");
  assert(!Object.values(packageConfig.scripts ?? {}).some(value => protectedToken.test(String(value))),
    "ATTEST_TRACKED_RUNTIME_REWRITE");
  const project = await vercel.project({ projectId: proof.projectId, teamId: proof.teamId });
  const deployment = await vercel.deployment({ deploymentId, teamId: proof.teamId });
  const listed = await vercel.deployments({ projectId: proof.projectId, teamId: proof.teamId, branch, sha: deployedSha });
  const listedDeployments = listed?.deployments ?? [];
  const matches = listedDeployments.filter(item => (item.uid ?? item.id) === deploymentId);
  assert(listedDeployments.length === 1 && matches.length === 1, "ATTEST_DEPLOYMENT_LIST_AMBIGUOUS");
  assert(matches[0].source === "git" && matches[0].target == null, "ATTEST_DEPLOYMENT_SOURCE_INVALID");
  assert(deployment.readyState === "READY" && deployment.projectId === proof.projectId && deployment.target == null
    && !deployment.customEnvironment && (deployment.uid ?? deployment.id) === deploymentId, "ATTEST_DEPLOYMENT_IDENTITY_INVALID");
  const sha = deployment.gitSource?.sha;
  assert(deployment.gitSource?.type === "github" && deployment.gitSource.ref === branch && sha === deployedSha
    && project.link?.type === "github" && project.link.repoId != null
    && deployment.gitSource.repoId === project.link.repoId && deployment.meta?.githubCommitRef === branch
    && deployment.meta?.githubCommitSha === deployedSha, "ATTEST_DEPLOYMENT_GIT_IDENTITY_INVALID");
  const origin = deploymentOrigin(deployment.url);
  const created = millis(deployment.createdAt);
  const versionTimes = [...DB_KEYS.map(key => proof.databaseVariables[key]),
    ...READABLE_KEYS.map(key => proof.readableVariables[key])].flatMap(row => [millis(row.createdAt), millis(row.updatedAt)]);
  assert(Number.isFinite(created) && created <= now() && created > configured
    && versionTimes.every(time => Number.isFinite(time) && created > time),
    "ATTEST_DEPLOYMENT_NOT_FRESH");
  assert(project.id === proof.projectId && project.accountId === proof.teamId && project.autoExposeSystemEnvs === true,
    "ATTEST_PROJECT_IDENTITY_INVALID");
  checkInventory(await vercel.inventory({ projectId: proof.projectId, teamId: proof.teamId }), proof);
  const readable = await vercel.readableConfig({ projectId: proof.projectId, teamId: proof.teamId, branch });
  assert(readable.values?.NEXT_PUBLIC_APP_ENV === "staging" && readable.values?.VERCEL_ENV === "preview"
    && readable.values?.NEXT_PUBLIC_SUPABASE_URL === `https://${proof.supabaseRef}.supabase.co`
    && readable.values?.PUSH_DELIVERY_MODE === "log_only", "ATTEST_READABLE_CONFIG_INVALID");
  const production = new URL(env.PRODUCTION_BASE_URL).origin;
  assert(origin !== production, "ATTEST_PRODUCTION_TARGET_FORBIDDEN");
  const databaseUrl = sessionDatabase(env.DIRECT_URL, proof.supabaseRef, proof.poolerHost);
  const db = openDatabase(databaseUrl);
  let catalog;
  try { catalog = await db.catalog(); } finally { await db.close(); }
  const api = createApi({ origin, fetchImpl });
  const [menu, powders] = await Promise.all([api.request("/api/menu"), api.request("/api/powders")]);
  assert(menu.ok && powders.ok, "ATTEST_PUBLIC_API_READ_FAILED");
  const databaseFingerprint = publicCatalogFingerprintFromDatabase(catalog);
  const apiDatabaseFingerprint = publicCatalogFingerprintFromApi(menu.body, powders.body);
  assert(databaseFingerprint === apiDatabaseFingerprint, "ATTEST_CATALOG_FINGERPRINT_MISMATCH");
  checkInventory(await vercel.inventory({ projectId: proof.projectId, teamId: proof.teamId }), proof);
  const verified = now();
  const evidence = { source: "vercel-api", environment: "preview", appEnvironment: "staging",
    projectId: proof.projectId, teamId: proof.teamId, branch, supabaseRef: proof.supabaseRef,
    poolerHost: proof.poolerHost,
    deploymentId, deploymentSha: sha, deploymentOrigin: origin, immutableDeployment: true,
    verifiedAt: new Date(verified).toISOString(), expiresAt: new Date(verified + 2 * 60 * 60_000).toISOString(),
    databaseBinding: { verified: true, source: "deployment-environment", supabaseRef: proof.supabaseRef,
      deploymentId, deploymentSha: sha, proofMode: "accepted-sensitive-branch-configuration-and-fresh-git-source-deployment",
      deploymentSecretReadback: false, environmentVersions: proof.databaseVariables },
    databaseFingerprint, apiDatabaseFingerprint, pushMode: "log_only", pushGuardVerified: true,
    pushGuardEvidence: { reviewedBlob: pushBlob, cleanTree: true, source: "git" }, deploymentSecretReadback: false,
    provenanceMode: "vercel-classified-git+observed-configured-branch",
    releaseWindowAssertion: { id: proof.releaseWindowId, assertedByOperator: true } };
  if (recoverRunId) Object.assign(evidence, { recoveryOnly: true, mode: "recovery-runner-descendant",
    runId: recoverRunId, runnerSha: head, runnerBaseSha: deployedSha });
  assert(validateTarget({ ...env, TEST_BASE_URL: origin, TEST_DEPLOYMENT_ID: deploymentId,
    TEST_DEPLOYMENT_SHA: sha, NEXT_PUBLIC_APP_ENV: "staging", VERCEL_ENV: "preview",
    DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl }, evidence, true).ok,
  "ATTEST_FINAL_TARGET_INVALID");
  return { evidence, file: writeAttestation(cwd, evidence, fsImpl) };
}
