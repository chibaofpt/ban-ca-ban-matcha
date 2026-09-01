// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import fs, { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { attestStaging } from "../../scripts/staging-tests/attest-control.mjs";
import { runnerBoundary } from "./staging-runner-boundary";
import { launchProfile } from "../../scripts/staging-tests/operator.mjs";

type BoundarySpawn = (executable: string, args: string[], options: { env?: NodeJS.ProcessEnv }) => { status: number | null };
type GitSpawn = (command: string, args: string[], options: { cwd?: string }) => { status: number | null; stdout: string; error?: Error };
type ProfileLaunch = (options: { cwd: string; profile: string; args?: string[]; spawn?: BoundarySpawn; gitSpawn?: GitSpawn }) => number;
const launch = launchProfile as unknown as ProfileLaunch;

const SHA = "a".repeat(40);
const PUSH_BLOB = "096a5cd881d78368912eb5c34559b02bad8edb42";
const base = Date.now();
const branch = "codex/release";
const dbRow = (key: string) => ({ id: `env_${key}`, key, type: "sensitive", target: ["preview"], gitBranch: branch,
  createdAt: base - 12_000, updatedAt: base - 11_000, customEnvironmentIds: [] });
const readableRow = (key: string) => ({ id: `env_${key}`, key, type: "encrypted", target: ["preview"], gitBranch: null,
  createdAt: base - 12_000, updatedAt: base - 11_000, customEnvironmentIds: [] });
const databaseVariables = Object.fromEntries(["DATABASE_URL", "DIRECT_URL"].map(key => [key, dbRow(key)]));
const readableVariables = Object.fromEntries(["NEXT_PUBLIC_APP_ENV", "NEXT_PUBLIC_SUPABASE_URL", "PUSH_DELIVERY_MODE"]
  .map(key => [key, readableRow(key)]));
const env = {
  TEST_VERCEL_PROJECT_ID: "prj_1", TEST_VERCEL_TEAM_ID: "team_1", TEST_VERCEL_GIT_BRANCH: branch,
  TEST_STAGING_SUPABASE_REF: "stage-ref", TEST_STAGING_POOLER_HOST: "aws-1.pooler.supabase.com",
  TEST_RELEASE_WINDOW_ID: "window-1", NEXT_PUBLIC_SUPABASE_URL: "https://stage-ref.supabase.co",
  NEXT_PUBLIC_APP_ENV: "staging", PRODUCTION_BASE_URL: "https://production.example.com",
  DATABASE_URL: "postgresql://postgres.stage-ref:secret@old.example/postgres",
  DIRECT_URL: "postgresql://postgres.stage-ref:secret@old.example/postgres",
};

function fixture(source: string | undefined, listOptions: { count?: number; id?: string } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "staging-attest-"));
  fs.mkdirSync(path.join(root, ".staging-test-runs"));
  const proof = { projectId: "prj_1", teamId: "team_1", branch, supabaseRef: "stage-ref",
    poolerHost: "aws-1.pooler.supabase.com", releaseWindowId: "window-1",
    configuredAt: new Date(base - 10_000).toISOString(), databaseVariables, readableVariables,
    deploymentSecretReadback: false, proofMode: "configured-sensitive-branch-variables-awaiting-fresh-git-deployment" };
  writeFileSync(path.join(root, ".staging-test-runs", "deployment-environment-proof.json"), JSON.stringify(proof));
  const git = { currentBranch: vi.fn(async () => branch), head: vi.fn(async () => SHA), status: vi.fn(async () => ""),
    pushBlob: vi.fn(async () => PUSH_BLOB),
    trackedFile: vi.fn<(file: string) => Promise<string>>(async (file: string) => file === "vercel.json" ? "{}" : '{"scripts":{}}') };
  const deployment = { uid: "dpl_1", readyState: "READY", projectId: "prj_1", target: null, url: "verified.vercel.app",
    createdAt: base - 8_000, meta: { githubCommitRef: branch, githubCommitSha: SHA },
    gitSource: { type: "github", ref: branch, sha: SHA, repoId: 123 } };
  const count = listOptions.count ?? 1;
  const deployments = Array.from({ length: count }, () => ({ uid: listOptions.id ?? "dpl_1", source, target: null }));
  const inventory = { envs: structuredClone([...Object.values(databaseVariables), ...Object.values(readableVariables)]), pagination: {} };
  const vercel = { project: vi.fn(async () => ({ id: "prj_1", accountId: "team_1", autoExposeSystemEnvs: true,
    link: { type: "github", repoId: 123 } })), deployment: vi.fn(async () => deployment),
    deployments: vi.fn(async () => ({ deployments, pagination: {} })), inventory: vi.fn(async () => inventory),
    readableConfig: vi.fn(async () => ({ values: { NEXT_PUBLIC_APP_ENV: "staging", VERCEL_ENV: "preview",
      NEXT_PUBLIC_SUPABASE_URL: "https://stage-ref.supabase.co", PUSH_DELIVERY_MODE: "log_only" } })) };
  return { root, git, vercel, deployment, inventory, proof };
}

describe("Staging attest — Vercel Git provenance", () => {
  it("accepts an id-only deployment GET response", async () => {
    const state = fixture("git");
    const boundary = runnerBoundary();
    Object.assign(state.deployment, { id: "dpl_1" });
    delete (state.deployment as { uid?: string }).uid;
    try {
      await expect(attestStaging({ cwd: state.root, deploymentId: "dpl_1", env, git: state.git, vercel: state.vercel,
        openDatabase: () => boundary.db, fetchImpl: boundary.fetchImpl, now: () => base })).resolves.toBeDefined();
    } finally { rmSync(state.root, { recursive: true, force: true }); }
  });

  it.each([
    ["vercel.json env", { env: { PUSH_DELIVERY_MODE: "deliver" } }, null],
    ["vercel.json build.env", { build: { env: { NEXT_PUBLIC_APP_ENV: "production" } } }, null],
    ["vercel.json buildEnv", { buildEnv: { VERCEL_ENV: "production" } }, null],
    ["cross-env script", {}, "cross-env NEXT_PUBLIC_SUPABASE_URL=https://other.example node x"],
    ["cmd set script", {}, "set DATABASE_URL=x&& node x"],
    ["PowerShell script", {}, "$env:DIRECT_URL='x'; node x"],
    ["quoted cmd script", {}, "set \"PUSH_DELIVERY_MODE=deliver\"&& node x"],
    ["cross-env-shell script", {}, "cross-env-shell \"NEXT_PUBLIC_APP_ENV=production node x\""],
    ["braced PowerShell script", {}, "${env:VERCEL_ENV}='production'; node x"],
  ])("rejects a tracked runtime override: %s", async (_label, vercelJson, script) => {
    const state = fixture("git");
    state.git.trackedFile.mockImplementation(async (file: string) => file === "vercel.json"
      ? JSON.stringify(vercelJson) : JSON.stringify({ scripts: script ? { x: script } : {} }));
    try {
      await expect(attestStaging({ cwd: state.root, deploymentId: "dpl_1", env, git: state.git, vercel: state.vercel,
        openDatabase: vi.fn(), now: () => base })).rejects.toThrow(/ATTEST_TRACKED_/);
      expect(state.vercel.project).not.toHaveBeenCalled();
    } finally { rmSync(state.root, { recursive: true, force: true }); }
  });
  it.each([undefined, "api-trigger-git-deploy", "cli", "redeploy", "git-deploy-hook", "clone/repo"])(
    "từ chối deployment source không phải git: %s", async source => {
      const state = fixture(source);
      try {
        await expect(attestStaging({ cwd: state.root, deploymentId: "dpl_1", env, git: state.git, vercel: state.vercel,
          openDatabase: vi.fn(), now: () => base })).rejects.toThrow("ATTEST_DEPLOYMENT_SOURCE_INVALID");
      } finally { rmSync(state.root, { recursive: true, force: true }); }
    });

  it.each([{ count: 0 }, { count: 2 }, { count: 1, id: "dpl_other" }])(
    "từ chối deployment list thiếu, ambiguous hoặc sai id %#", async options => {
      const state = fixture("git", options);
      try {
        await expect(attestStaging({ cwd: state.root, deploymentId: "dpl_1", env, git: state.git, vercel: state.vercel,
          openDatabase: vi.fn(), now: () => base })).rejects.toThrow("ATTEST_DEPLOYMENT_LIST_AMBIGUOUS");
      } finally { rmSync(state.root, { recursive: true, force: true }); }
    });

  it("chấp nhận cursor của Vercel khi query giới hạn trả đúng một deployment", async () => {
    const state = fixture("git");
    const boundary = runnerBoundary();
    state.vercel.deployments.mockResolvedValue({
      deployments: [{ uid: "dpl_1", source: "git", target: null }],
      pagination: { count: 1, next: base - 8_000, prev: base - 8_000 },
    });
    try {
      await expect(attestStaging({ cwd: state.root, deploymentId: "dpl_1", env, git: state.git,
        vercel: state.vercel, openDatabase: () => boundary.db, fetchImpl: boundary.fetchImpl,
        now: () => base })).resolves.toBeDefined();
    } finally { rmSync(state.root, { recursive: true, force: true }); }
  });

  it("invalidates an old artifact before a failed refresh", async () => {
    const state = fixture("cli");
    const oldFile = path.join(state.root, ".staging-test-runs", "attestation.json");
    writeFileSync(oldFile, JSON.stringify({ sentinel: "previous-valid-artifact" }));
    try {
      await expect(attestStaging({ cwd: state.root, deploymentId: "dpl_1", env, git: state.git, vercel: state.vercel,
        openDatabase: vi.fn(), now: () => base })).rejects.toThrow("ATTEST_DEPLOYMENT_SOURCE_INVALID");
      expect(JSON.parse(fs.readFileSync(oldFile, "utf8"))).not.toMatchObject({ sentinel: "previous-valid-artifact" });
    } finally { rmSync(state.root, { recursive: true, force: true }); }
  });

  it("does not follow an attestation symlink while invalidating", async () => {
    const state = fixture("git");
    const outside = path.join(state.root, "outside.json");
    writeFileSync(outside, "outside-remains");
    fs.symlinkSync(outside, path.join(state.root, ".staging-test-runs", "attestation.json"), "file");
    try {
      await expect(attestStaging({ cwd: state.root, deploymentId: "dpl_1", env, git: state.git, vercel: state.vercel,
        openDatabase: vi.fn(), now: () => base })).rejects.toThrow("ATTEST_EXISTING_ARTIFACT_UNSAFE");
      expect(fs.readFileSync(outside, "utf8")).toBe("outside-remains");
      expect(state.git.currentBranch).not.toHaveBeenCalled();
    } finally { rmSync(state.root, { recursive: true, force: true }); }
  });

  it("cấp attestation tối đa hai giờ cho source git và catalog trùng khớp", async () => {
    const state = fixture("git");
    const boundary = runnerBoundary();
    try {
      const result = await attestStaging({ cwd: state.root, deploymentId: "dpl_1", env, git: state.git, vercel: state.vercel,
        openDatabase: () => boundary.db, fetchImpl: boundary.fetchImpl, now: () => base });
      expect(result.evidence).toMatchObject({ deploymentId: "dpl_1", deploymentSha: SHA,
        provenanceMode: "vercel-classified-git+observed-configured-branch",
        releaseWindowAssertion: { id: "window-1", assertedByOperator: true }, deploymentSecretReadback: false });
      expect(Date.parse(result.evidence.expiresAt) - Date.parse(result.evidence.verifiedAt)).toBe(2 * 60 * 60_000);
      expect(boundary.db.close).toHaveBeenCalledOnce();
      expect(JSON.parse(fs.readFileSync(result.file, "utf8"))).toEqual(result.evidence);
      const operatorEnv = { ...env, TEST_MAX_RUNTIME_MINUTES: "60", TEST_CUSTOMER_A_PHONE: "1",
        TEST_CUSTOMER_A_PASSWORD: "a", TEST_CUSTOMER_B_PHONE: "2", TEST_CUSTOMER_B_PASSWORD: "b",
        TEST_ADMIN_PHONE: "3", TEST_ADMIN_PASSWORD: "c", TEST_STAFF_PHONE: "4", TEST_STAFF_PASSWORD: "d" };
      writeFileSync(path.join(state.root, ".env.staging"), Object.entries(operatorEnv).map(([key, value]) => `${key}=${value}`).join("\n"));
      writeFileSync(path.join(state.root, ".env.staging.local"), "# secrets already supplied in fixture\n");
      const spawn = vi.fn<BoundarySpawn>(() => ({ status: 2 }));
      expect(launch({ cwd: state.root, profile: "recover", args: ["--run-id", "run_12345678"], spawn })).toBe(2);
      expect(spawn.mock.calls[0][2].env).toMatchObject({ TEST_BASE_URL: "https://verified.vercel.app",
        TEST_DEPLOYMENT_ID: "dpl_1", TEST_DEPLOYMENT_SHA: SHA });
      writeFileSync(result.file, JSON.stringify({ ...result.evidence, recoveryOnly: true,
        mode: "recovery-runner-descendant", runId: "run_12345678", runnerSha: SHA, runnerBaseSha: "b".repeat(40) }));
      const recoverySpawn = vi.fn<BoundarySpawn>(() => ({ status: 2 }));
      const gitSpawn = vi.fn((_command: string, args: string[]) => ({ status: 0,
        stdout: args.includes("status") ? "" : `${SHA}\n` }));
      expect(launch({ cwd: state.root, profile: "recover", args: ["--run-id", "run_12345678"],
        spawn: recoverySpawn, gitSpawn })).toBe(2);
      expect(() => launch({ cwd: state.root, profile: "full", spawn: vi.fn(), gitSpawn }))
        .toThrow("OPERATOR_RECOVERY_ATTESTATION_FORBIDDEN");
      const dirtyGit = vi.fn((_command: string, args: string[]) => ({ status: 0,
        stdout: args.includes("status") ? "?? unexpected.txt\n" : `${SHA}\n` }));
      const dirtySpawn = vi.fn<BoundarySpawn>(() => ({ status: 2 }));
      expect(() => launch({ cwd: state.root, profile: "recover", args: ["--run-id", "run_12345678"],
        spawn: dirtySpawn, gitSpawn: dirtyGit })).toThrow("OPERATOR_RUNNER_TREE_DIRTY");
      expect(dirtySpawn).not.toHaveBeenCalled();
      writeFileSync(result.file, JSON.stringify(result.evidence));
      state.vercel.deployments.mockResolvedValue({ deployments: [{ uid: "dpl_1", source: "cli", target: null }], pagination: {} });
      let markerCloses = 0;
      const racingFs = new Proxy(fs, { get(target, property) {
        if (property === "renameSync") return (from: fs.PathLike, to: fs.PathLike) => {
          writeFileSync(result.file, JSON.stringify(result.evidence));
          return fs.renameSync(from, to);
        };
        if (property === "closeSync") return (descriptor: number) => { markerCloses += 1; return fs.closeSync(descriptor); };
        return Reflect.get(target, property);
      } });
      await expect(attestStaging({ cwd: state.root, deploymentId: "dpl_1", env, git: state.git, vercel: state.vercel,
        openDatabase: () => boundary.db, fetchImpl: boundary.fetchImpl, now: () => base, fsImpl: racingFs }))
        .rejects.toThrow("ATTEST_DEPLOYMENT_SOURCE_INVALID");
      expect(markerCloses).toBe(1);
      const failedRefreshSpawn = vi.fn();
      expect(() => launch({ cwd: state.root, profile: "full", spawn: failedRefreshSpawn }))
        .toThrow(/OPERATOR_ATTESTATION_(?:INVALID|PIN_MISMATCH)/);
      expect(failedRefreshSpawn).not.toHaveBeenCalled();
      writeFileSync(result.file, JSON.stringify(result.evidence));
      writeFileSync(result.file, JSON.stringify({ ...result.evidence,
        releaseWindowAssertion: { id: "another-window", assertedByOperator: true } }));
      const mismatchedWindowSpawn = vi.fn();
      expect(() => launch({ cwd: state.root, profile: "full", spawn: mismatchedWindowSpawn }))
        .toThrow("OPERATOR_ATTESTATION_PIN_MISMATCH");
      expect(mismatchedWindowSpawn).not.toHaveBeenCalled();
      writeFileSync(result.file, JSON.stringify({ ...result.evidence, expiresAt: new Date(base - 1).toISOString() }));
      const expiredSpawn = vi.fn();
      expect(() => launch({ cwd: state.root, profile: "full", spawn: expiredSpawn })).toThrow("OPERATOR_ATTESTATION_INVALID");
      expect(expiredSpawn).not.toHaveBeenCalled();
    } finally { rmSync(state.root, { recursive: true, force: true }); }
  });

  it("cấp attestation recovery-only cho runner descendant an toàn", async () => {
    const state = fixture("git");
    const boundary = runnerBoundary();
    const oldSha = "b".repeat(40);
    const runId = "run_12345678";
    const runDir = path.join(state.root, ".staging-test-runs", runId);
    fs.mkdirSync(runDir);
    writeFileSync(path.join(runDir, "state.ndjson"), `${JSON.stringify({ event: "INITIAL", target: {
      origin: "https://verified.vercel.app", supabaseRef: "stage-ref", deploymentId: "dpl_1" } })}\n`);
    writeFileSync(path.join(runDir, "journal.ndjson"), `${JSON.stringify({ state: "INTENT",
      at: new Date(base - 7_000).toISOString() })}\n`);
    writeFileSync(path.join(state.root, ".staging-test-runs", "attestation.json"), JSON.stringify({
      deploymentId: "dpl_1", deploymentSha: oldSha, deploymentOrigin: "https://verified.vercel.app",
      projectId: "prj_1", teamId: "team_1", branch, supabaseRef: "stage-ref",
      poolerHost: "aws-1.pooler.supabase.com", source: "vercel-api", environment: "preview",
      appEnvironment: "staging", immutableDeployment: true, pushMode: "log_only", pushGuardVerified: true,
      pushGuardEvidence: { reviewedBlob: PUSH_BLOB, cleanTree: true, source: "git" }, deploymentSecretReadback: false,
      provenanceMode: "vercel-classified-git+observed-configured-branch", databaseFingerprint: "catalog-fingerprint",
      apiDatabaseFingerprint: "catalog-fingerprint", databaseBinding: { deploymentId: "dpl_1", deploymentSha: oldSha,
        supabaseRef: "stage-ref", verified: true, source: "deployment-environment",
        proofMode: "accepted-sensitive-branch-configuration-and-fresh-git-source-deployment", deploymentSecretReadback: false },
      releaseWindowAssertion: { id: "window-1", assertedByOperator: true },
      verifiedAt: new Date(base - 9_000).toISOString(), expiresAt: new Date(base - 6_000).toISOString(),
    }));
    state.deployment.gitSource.sha = oldSha;
    state.deployment.meta.githubCommitSha = oldSha;
    state.vercel.deployments.mockResolvedValue({ deployments: [{ uid: "dpl_1", source: "git", target: null }], pagination: {} });
    Object.assign(state.git, { isAncestor: vi.fn(async () => true),
      diffNameStatus: vi.fn(async () => "M\tscripts/staging-tests/session-renewal.mjs\nA\tlib/__tests__/staging-recovery.test.ts\n"),
      pushBlobAt: vi.fn(async () => PUSH_BLOB) });
    try {
      const result = await attestStaging({ cwd: state.root, deploymentId: "dpl_1", recoverRunId: runId,
        env, git: state.git, vercel: state.vercel, openDatabase: () => boundary.db,
        fetchImpl: boundary.fetchImpl, now: () => base });
      expect(result.evidence).toMatchObject({ recoveryOnly: true, mode: "recovery-runner-descendant", runId,
        runnerSha: SHA, runnerBaseSha: oldSha, deploymentSha: oldSha });
      const archive = path.join(runDir, "historical-attestation.json");
      expect(fs.lstatSync(archive).isFile()).toBe(true);
      state.vercel.deployments.mockResolvedValue({ deployments: [{ uid: "dpl_1", source: "cli", target: null }], pagination: {} });
      await expect(attestStaging({ cwd: state.root, deploymentId: "dpl_1", recoverRunId: runId,
        env, git: state.git, vercel: state.vercel, openDatabase: () => boundary.db,
        fetchImpl: boundary.fetchImpl, now: () => base })).rejects.toThrow("ATTEST_DEPLOYMENT_SOURCE_INVALID");
      expect(JSON.parse(fs.readFileSync(result.file, "utf8"))).toEqual({ invalidated: true });
      state.vercel.deployments.mockResolvedValue({ deployments: [{ uid: "dpl_1", source: "git", target: null }], pagination: {} });
      await expect(attestStaging({ cwd: state.root, deploymentId: "dpl_1", recoverRunId: runId,
        env, git: state.git, vercel: state.vercel, openDatabase: () => boundary.db,
        fetchImpl: boundary.fetchImpl, now: () => base })).resolves.toBeDefined();
      const incomplete = JSON.parse(fs.readFileSync(archive, "utf8"));
      delete incomplete.databaseBinding.verified;
      writeFileSync(archive, JSON.stringify(incomplete));
      writeFileSync(result.file, JSON.stringify({ invalidated: true }));
      await expect(attestStaging({ cwd: state.root, deploymentId: "dpl_1", recoverRunId: runId,
        env, git: state.git, vercel: state.vercel, openDatabase: () => boundary.db,
        fetchImpl: boundary.fetchImpl, now: () => base })).rejects.toThrow("ATTEST_HISTORICAL_EVIDENCE_INVALID");
    } finally { rmSync(state.root, { recursive: true, force: true }); }
  });

  it("invalidates historical global proof for a malformed recovery run without archiving", async () => {
    const state = fixture("git");
    const global = path.join(state.root, ".staging-test-runs", "attestation.json");
    writeFileSync(global, JSON.stringify({ historical: true }));
    try {
      await expect(attestStaging({ cwd: state.root, deploymentId: "dpl_1", recoverRunId: "../wrong",
        env, git: state.git, vercel: state.vercel, openDatabase: vi.fn(), now: () => base }))
        .rejects.toThrow("ATTEST_RECOVERY_RUN_ID_INVALID");
      expect(JSON.parse(fs.readFileSync(global, "utf8"))).toEqual({ invalidated: true });
      expect(fs.existsSync(path.join(state.root, ".staging-test-runs", "wrong", "historical-attestation.json"))).toBe(false);
    } finally { rmSync(state.root, { recursive: true, force: true }); }
  });

  it("rejects recovery evidence for another run before consulting its archive", async () => {
    const state = fixture("git");
    const requested = "run_abcdefgh";
    const runDir = path.join(state.root, ".staging-test-runs", requested);
    fs.mkdirSync(runDir);
    writeFileSync(path.join(runDir, "historical-attestation.json"), "archive-must-not-be-used");
    writeFileSync(path.join(state.root, ".staging-test-runs", "attestation.json"), JSON.stringify({
      recoveryOnly: true, mode: "recovery-runner-descendant", runId: "run_other123", deploymentId: "dpl_1",
      projectId: "prj_1", teamId: "team_1", branch, supabaseRef: "stage-ref", poolerHost: "aws-1.pooler.supabase.com",
      releaseWindowAssertion: { id: "window-1" },
    }));
    try {
      await expect(attestStaging({ cwd: state.root, deploymentId: "dpl_1", recoverRunId: requested,
        env, git: state.git, vercel: state.vercel, openDatabase: vi.fn(), now: () => base }))
        .rejects.toThrow("ATTEST_RECOVERY_GLOBAL_MISMATCH");
      expect(fs.readFileSync(path.join(runDir, "historical-attestation.json"), "utf8")).toBe("archive-must-not-be-used");
      expect(JSON.parse(fs.readFileSync(path.join(state.root, ".staging-test-runs", "attestation.json"), "utf8")))
        .toEqual({ invalidated: true });
    } finally { rmSync(state.root, { recursive: true, force: true }); }
  });

  it("rejects a symlinked exact run directory without archiving outside", async () => {
    const state = fixture("git");
    const outside = mkdtempSync(path.join(tmpdir(), "staging-run-outside-"));
    const runId = "run_87654321";
    writeFileSync(path.join(outside, "state.ndjson"), `${JSON.stringify({ event: "INITIAL", target: {} })}\n`);
    writeFileSync(path.join(outside, "journal.ndjson"), `${JSON.stringify({ state: "INTENT", at: new Date(base).toISOString() })}\n`);
    writeFileSync(path.join(outside, "historical-attestation.json"), "outside-archive-remains");
    fs.symlinkSync(outside, path.join(state.root, ".staging-test-runs", runId), "junction");
    writeFileSync(path.join(state.root, ".staging-test-runs", "attestation.json"), JSON.stringify({ historical: true }));
    try {
      await expect(attestStaging({ cwd: state.root, deploymentId: "dpl_1", recoverRunId: runId,
        env, git: state.git, vercel: state.vercel, openDatabase: vi.fn(), now: () => base }))
        .rejects.toThrow("ATTEST_RECOVERY_RUN_DIRECTORY_UNSAFE");
      expect(fs.readFileSync(path.join(outside, "historical-attestation.json"), "utf8")).toBe("outside-archive-remains");
      expect(JSON.parse(fs.readFileSync(path.join(state.root, ".staging-test-runs", "attestation.json"), "utf8")))
        .toEqual({ invalidated: true });
    } finally {
      rmSync(state.root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it.each([
    ["dirty", "ATTEST_GIT_TREE_DIRTY"], ["blob", "ATTEST_PUSH_BLOB_UNREVIEWED"],
  ])("từ chối Git state chưa review: %s", async (fault, code) => {
    const state = fixture("git");
    if (fault === "dirty") state.git.status.mockResolvedValue(" M package.json");
    else state.git.pushBlob.mockResolvedValue("b".repeat(40));
    try {
      await expect(attestStaging({ cwd: state.root, deploymentId: "dpl_1", env, git: state.git, vercel: state.vercel,
        openDatabase: vi.fn(), now: () => base })).rejects.toThrow(code);
    } finally { rmSync(state.root, { recursive: true, force: true }); }
  });

  it.each(["future-proof", "future-deployment", "old-deployment", "stale-env", "production-origin"])(
    "từ chối temporal/target mismatch: %s", async fault => {
      const state = fixture("git");
      const localEnv = { ...env };
      if (fault === "future-proof") {
        state.proof.configuredAt = new Date(base + 1).toISOString();
        writeFileSync(path.join(state.root, ".staging-test-runs", "deployment-environment-proof.json"), JSON.stringify(state.proof));
      } else if (fault === "future-deployment") state.deployment.createdAt = base + 1;
      else if (fault === "old-deployment") state.deployment.createdAt = base - 20_000;
      else if (fault === "stale-env") state.inventory.envs[0].updatedAt = base - 1;
      else localEnv.PRODUCTION_BASE_URL = "https://verified.vercel.app";
      try {
        await expect(attestStaging({ cwd: state.root, deploymentId: "dpl_1", env: localEnv, git: state.git, vercel: state.vercel,
          openDatabase: vi.fn(), now: () => base })).rejects.toThrow(/^ATTEST_/);
      } finally { rmSync(state.root, { recursive: true, force: true }); }
    });

  it("đóng DB và từ chối khi fingerprint API/DB khác nhau", async () => {
    const state = fixture("git");
    const boundary = runnerBoundary();
    const alteredDb = { ...boundary.db, catalog: async () => ({ ...(await boundary.db.catalog()), items: [] }) };
    try {
      await expect(attestStaging({ cwd: state.root, deploymentId: "dpl_1", env, git: state.git, vercel: state.vercel,
        openDatabase: () => alteredDb, fetchImpl: boundary.fetchImpl, now: () => base }))
        .rejects.toThrow("ATTEST_CATALOG_FINGERPRINT_MISMATCH");
      expect(boundary.db.close).toHaveBeenCalledOnce();
    } finally { rmSync(state.root, { recursive: true, force: true }); }
  });
});
