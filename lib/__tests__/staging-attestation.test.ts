// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import fs, { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { loadAttestation } from "../../scripts/staging-tests/attestation.mjs";
import { launchProfile, loadOperatorEnvironment, readVerifiedFile } from "../../scripts/staging-tests/operator.mjs";
import { configureStagingDatabase, openJournal } from "../../scripts/staging-tests/configure.mjs";
import { createControlPlane, resolveNpmCli } from "../../scripts/staging-tests/vercel-control.mjs";
import { spawnSync } from "node:child_process";

type BoundarySpawn = (executable: string, args: string[], options: {
  cwd?: string; shell?: boolean; input?: string; env?: NodeJS.ProcessEnv;
}) => { status: number | null; stdout?: string };
const controlSpawn = (implementation: BoundarySpawn) => implementation as unknown as typeof spawnSync;
type ProfileLaunch = (options: { cwd: string; profile: string; args?: string[]; spawn?: BoundarySpawn }) => number;
const launch = launchProfile as unknown as ProfileLaunch;

describe("Attestation staging — file local ngắn hạn", () => {
  it("từ chối symlink thay vì đọc chứng cứ ngoài run root", () => {
    const root = mkdtempSync(path.join(tmpdir(), "attestation-"));
    const outside = path.join(root, "outside.json");
    try {
      writeFileSync(outside, "{}");
      symlinkSync(outside, path.join(root, "attestation.json"));
      expect(() => loadAttestation(root)).toThrow("ATTESTATION_FILE_INVALID");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("Staging configure — database branch-scoped", () => {
  it("chạy npm version thật qua Node không shell và không mạng", () => {
    const npmCli = resolveNpmCli();
    expect(npmCli).toBeTruthy();
    if (!npmCli) throw new Error("npm cli missing");
    const result = spawnSync(process.execPath, [npmCli, "--version"], {
      cwd: process.cwd(), shell: false, encoding: "utf8", windowsHide: true, timeout: 15_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("resolve npm ưu tiên runtime đã xác minh và fail closed khi chưa cài", () => {
    const executable = path.resolve("runtime/node");
    const explicit = path.resolve("installed/npm/bin/npm-cli.js");
    const fallback = path.join(path.dirname(executable), "node_modules/npm/bin/npm-cli.js");
    const filesystem: typeof fs = new Proxy(fs, { get(target, property) {
      if (property === "statSync") return (file: fs.PathLike) => {
        if (file !== explicit && file !== fallback) throw new Error("unexpected path");
        return fs.statSync(path.resolve("package.json"));
      };
      return Reflect.get(target, property);
    } });
    expect(resolveNpmCli({ execPath: executable, source: { NODE_ENV: "test", npm_execpath: explicit }, fsImpl: filesystem })).toBe(explicit);
    expect(resolveNpmCli({ execPath: executable, source: { NODE_ENV: "test" }, fsImpl: filesystem })).toBe(fallback);
    const missingFilesystem: typeof fs = new Proxy(fs, { get(target, property) {
      if (property === "statSync") return () => { throw new Error("missing"); };
      return Reflect.get(target, property);
    } });
    expect(() => resolveNpmCli({ execPath: executable, source: { NODE_ENV: "test" }, fsImpl: missingFilesystem }))
      .toThrow("VERCEL_CONTROL_NPM_INSTALL_REQUIRED");
  });

  it("Git và Vercel đều nhận cwd đã chọn thay vì cwd của caller", async () => {
    const selected = path.resolve("separate-workspace");
    const calls: Array<{ executable: string; options: { cwd?: string; shell?: boolean } }> = [];
    const spawn = (executable: string, _args: string[], options: { cwd?: string; shell?: boolean }) => {
      calls.push({ executable, options });
      return { status: 0, stdout: executable === "git" ? "dev\n" : "{}" };
    };
    const control = createControlPlane({ cwd: selected, spawn: controlSpawn(spawn) });
    await expect(control.git.currentBranch()).resolves.toBe("dev");
    await control.vercel.project({ projectId: "prj_1", teamId: "team_1" });
    expect(calls).toHaveLength(2);
    for (const call of calls) expect(call.options).toMatchObject({ cwd: selected, shell: false });
  });
  it("mọi Git command đều ghim safe.directory của worktree", async () => {
    const selected = path.resolve("separate-workspace");
    const calls: string[][] = [];
    const spawn = vi.fn<BoundarySpawn>((_executable, args) => {
      calls.push(args);
      if (args.includes("branch")) return { status: 0, stdout: "codex/release\n" };
      if (args.includes("status")) return { status: 0, stdout: "" };
      return { status: 0, stdout: `${"a".repeat(40)}\n` };
    });
    const { git } = createControlPlane({ cwd: selected, spawn: controlSpawn(spawn) });
    await expect(Promise.all([git.currentBranch(), git.head(), git.status(), git.pushBlob(),
      git.trackedFile("vercel.json")])).resolves.toHaveLength(5);
    const safe = `safe.directory=${selected.replaceAll("\\", "/")}`;
    expect(calls).toHaveLength(5);
    for (const args of calls) expect(args.slice(0, 2)).toEqual(["-c", safe]);
    expect(calls.map(args => args.slice(2))).toEqual([
      ["branch", "--show-current"], ["rev-parse", "HEAD"], ["status", "--porcelain", "--untracked-files=all"],
      ["rev-parse", "HEAD:lib/push.ts"], ["show", "HEAD:vercel.json"],
    ]);
  });

  const env = {
    NEXT_PUBLIC_APP_ENV: "staging", NEXT_PUBLIC_SUPABASE_URL: "https://stage-ref.supabase.co",
    TEST_STAGING_SUPABASE_REF: "stage-ref", TEST_STAGING_POOLER_HOST: "aws-1.pooler.supabase.com",
    TEST_VERCEL_GIT_BRANCH: "codex/release", TEST_VERCEL_PROJECT_ID: "prj_1", TEST_VERCEL_TEAM_ID: "team_1",
    TEST_RELEASE_WINDOW_ID: "release-window-1",
    DATABASE_URL: "postgresql://postgres.stage-ref:database-secret@old.example/postgres",
    DIRECT_URL: "postgresql://postgres.stage-ref:direct-secret@old.example/postgres",
  };
  const row = (key: string, id = `env_${key}`) => ({ id, key, type: "sensitive", target: ["preview"],
    gitBranch: "codex/release", createdAt: 100, updatedAt: 200, customEnvironmentIds: [] });
  const readableRows = ["NEXT_PUBLIC_APP_ENV", "NEXT_PUBLIC_SUPABASE_URL", "PUSH_DELIVERY_MODE"]
    .map(key => ({ ...row(key), type: "encrypted" }));

  it("từ chối production branch trước Git và Vercel boundary", async () => {
    const git = { currentBranch: vi.fn() };
    const vercel = { inventory: vi.fn(), project: vi.fn(), readableConfig: vi.fn(), upsertSensitive: vi.fn() };
    await expect(configureStagingDatabase({ branch: "main", env: {}, git, vercel, cwd: "unused" }))
      .rejects.toThrow("CONFIGURE_BRANCH_FORBIDDEN");
    expect(git.currentBranch).not.toHaveBeenCalled();
    expect(vercel.inventory).not.toHaveBeenCalled();
  });

  it.each(["TEST_VERCEL_GIT_BRANCH", "TEST_VERCEL_PROJECT_ID", "TEST_VERCEL_TEAM_ID", "TEST_RELEASE_WINDOW_ID"])(
    "từ chối thiếu immutable pin %s trước adapter", async missing => {
      const pinned = { ...env, [missing]: "" };
      const git = { currentBranch: vi.fn() };
      const vercel = { linkage: vi.fn(), inventory: vi.fn(), upsertSensitive: vi.fn() };
      await expect(configureStagingDatabase({ cwd: "unused", branch: "codex/release", env: pinned, git, vercel }))
        .rejects.toThrow("CONFIGURE_IMMUTABLE_PIN_MISSING");
      expect(git.currentBranch).not.toHaveBeenCalled();
      expect(vercel.upsertSensitive).not.toHaveBeenCalled();
    });

  it("ghi intent trước mutation và proof chỉ chứa metadata không chứa secret", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-configure-success-"));
    let rows: ReturnType<typeof row>[] = [];
    const git = { currentBranch: vi.fn(async () => "codex/release") };
    const spawn = vi.fn((_executable: string, _args: string[], options: { input?: string }) => {
      const payload: unknown = JSON.parse(options.input ?? "null");
      const body = Array.isArray(payload) ? payload[0] : payload;
      if (!body || typeof body !== "object" || !("key" in body) || typeof body.key !== "string") {
        throw new Error("unexpected Vercel env payload");
      }
      const journal = readFileSync(path.join(root, ".staging-test-runs", "deployment-environment-configuration.ndjson"), "utf8");
      expect(JSON.parse(journal.trim().split("\n").at(-1) ?? "{}")).toMatchObject({ kind: "INTENT", key: body.key });
      const created = row(body.key);
      rows = [...rows, created];
      return { status: 0, stdout: JSON.stringify({ created: [created], failed: [] }) };
    });
    const control = createControlPlane({ cwd: root, spawn: controlSpawn(spawn) });
    const vercel = {
      ...control.vercel,
      linkage: vi.fn(async () => ({ projectId: "prj_1", teamId: "team_1" })),
      project: vi.fn(async () => ({ id: "prj_1", accountId: "team_1", autoExposeSystemEnvs: true })),
      inventory: vi.fn(async () => ({ envs: rows, pagination: {} })),
      readableConfig: vi.fn(async () => ({ values: { NEXT_PUBLIC_APP_ENV: "staging",
        NEXT_PUBLIC_SUPABASE_URL: "https://stage-ref.supabase.co", PUSH_DELIVERY_MODE: "log_only" }, rows: readableRows })),
    };
    try {
      const result = await configureStagingDatabase({ cwd: root, branch: "codex/release", env, git, vercel,
        now: () => "2026-08-31T00:00:00.000Z" });
      expect(result.status).toBe("PASS");
      const journal = readFileSync(path.join(root, ".staging-test-runs", "deployment-environment-configuration.ndjson"), "utf8");
      const proof = readFileSync(result.proofFile, "utf8");
      for (const secret of ["database-secret", "direct-secret"]) {
        expect(journal).not.toContain(secret);
        expect(proof).not.toContain(secret);
      }
      expect(JSON.parse(proof)).toMatchObject({ projectId: "prj_1", teamId: "team_1", branch: "codex/release",
        deploymentSecretReadback: false, readableClaims: { appEnvironment: "staging", pushMode: "log_only" } });
      expect(spawn).toHaveBeenCalledTimes(2);
      const bodies = spawn.mock.calls.map(call => {
        const payload: unknown = JSON.parse(call[2].input ?? "null");
        return Array.isArray(payload) ? payload[0] : payload;
      });
      for (const body of bodies) {
        if (!body || typeof body !== "object" || !("value" in body) || typeof body.value !== "string"
          || !("key" in body) || typeof body.key !== "string") throw new Error("unexpected Vercel env payload");
        const configured = new URL(body.value);
        expect(configured.searchParams.get("connection_limit")).toBe("1");
        expect(configured.searchParams.get("connect_timeout")).toBe("10");
        expect(configured.searchParams.get("pool_timeout")).toBe("10");
        expect(configured.searchParams.get("pgbouncer")).toBe(body.key === "DATABASE_URL" ? "true" : null);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("không để proof sẵn sàng khi mutation bị lỗi một phần", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-configure-partial-"));
    const proof = path.join(root, ".staging-test-runs", "deployment-environment-proof.json");
    const vercel = {
      linkage: async () => ({ projectId: "prj_1", teamId: "team_1" }),
      project: async () => ({ id: "prj_1", accountId: "team_1", autoExposeSystemEnvs: true }),
      inventory: async () => ({ envs: [], pagination: {} }), readableConfig: vi.fn(),
      upsertSensitive: vi.fn(async () => { throw new Error("adapter leaked database-secret"); }),
    };
    try {
      await expect(configureStagingDatabase({ cwd: root, branch: "codex/release", env,
        git: { currentBranch: async () => "codex/release" }, vercel }))
        .rejects.toThrow("CONFIGURE_MUTATION_FAILED");
      expect(fs.existsSync(proof)).toBe(false);
      expect(readFileSync(path.join(root, ".staging-test-runs", "deployment-environment-configuration.ndjson"), "utf8"))
        .toContain('"kind":"INTENT"');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("malformed create envelope được sanitize và không tạo proof", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-configure-envelope-"));
    const control = createControlPlane({ cwd: root, spawn: controlSpawn(vi.fn(() => ({ status: 0,
      stdout: JSON.stringify({ created: [], failed: [{ key: "DATABASE_URL" }] }) }))) });
    const vercel = { ...control.vercel,
      linkage: async () => ({ projectId: "prj_1", teamId: "team_1" }),
      project: async () => ({ id: "prj_1", accountId: "team_1", autoExposeSystemEnvs: true }),
      inventory: async () => ({ envs: [], pagination: {} }) };
    try {
      await expect(configureStagingDatabase({ cwd: root, branch: "codex/release", env,
        git: { currentBranch: async () => "codex/release" }, vercel }))
        .rejects.toThrow("CONFIGURE_MUTATION_FAILED");
      expect(fs.existsSync(path.join(root, ".staging-test-runs", "deployment-environment-proof.json"))).toBe(false);
      expect(readFileSync(path.join(root, ".staging-test-runs", "deployment-environment-configuration.ndjson"), "utf8"))
        .toContain('"kind":"INTENT"');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("từ chối PATCH response không khớp row sau inventory", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-configure-response-"));
    const rows = [row("DATABASE_URL"), row("DIRECT_URL")];
    const vercel = {
      linkage: async () => ({ projectId: "prj_1", teamId: "team_1" }),
      project: async () => ({ id: "prj_1", accountId: "team_1", autoExposeSystemEnvs: true }),
      inventory: async () => ({ envs: rows, pagination: {} }), readableConfig: vi.fn(),
      upsertSensitive: vi.fn(async ({ key }: { key: string }) => ({ ...row(key), id: "env_misdirected" })),
    };
    try {
      await expect(configureStagingDatabase({ cwd: root, branch: "codex/release", env,
        git: { currentBranch: async () => "codex/release" }, vercel }))
        .rejects.toThrow("CONFIGURE_MUTATION_RESPONSE_INVALID");
      expect(fs.existsSync(path.join(root, ".staging-test-runs", "deployment-environment-proof.json"))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("từ chối journal leaf symlink trước mutation", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-configure-journal-link-"));
    const outside = path.join(root, "outside.ndjson");
    const upsertSensitive = vi.fn();
    try {
      fs.mkdirSync(path.join(root, ".staging-test-runs"));
      writeFileSync(outside, "");
      symlinkSync(outside, path.join(root, ".staging-test-runs", "deployment-environment-configuration.ndjson"));
      const vercel = {
        linkage: async () => ({ projectId: "prj_1", teamId: "team_1" }),
        project: async () => ({ id: "prj_1", accountId: "team_1", autoExposeSystemEnvs: true }),
        inventory: async () => ({ envs: [], pagination: {} }), upsertSensitive,
      };
      await expect(configureStagingDatabase({ cwd: root, branch: "codex/release", env,
        git: { currentBranch: async () => "codex/release" }, vercel })).rejects.toThrow("CONFIGURE_JOURNAL_UNSAFE");
      expect(upsertSensitive).not.toHaveBeenCalled();
      expect(readFileSync(outside, "utf8")).toBe("");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("đóng journal handle đúng một lần khi validation sau open ném lỗi", () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-journal-close-"));
    const journal = path.join(root, "journal.ndjson");
    let closed = 0;
    const facade = Object.assign(Object.create(fs), {
      lstatSync(target: fs.PathLike) {
        if (path.resolve(String(target)) === path.resolve(journal)) throw new Error("simulated lstat failure");
        return fs.lstatSync(target);
      },
      closeSync(handle: number) { closed += 1; fs.closeSync(handle); },
    });
    try {
      expect(() => openJournal(journal, root, facade)).toThrow("simulated lstat failure");
      expect(closed).toBe(1);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("từ chối run root có ancestor junction trước mutation", async () => {
    const holder = mkdtempSync(path.join(tmpdir(), "staging-configure-root-holder-"));
    const outside = mkdtempSync(path.join(tmpdir(), "staging-configure-root-outside-"));
    const linked = path.join(holder, "linked-workspace");
    const upsertSensitive = vi.fn();
    try {
      symlinkSync(outside, linked, "junction");
      const vercel = { linkage: async () => ({ projectId: "prj_1", teamId: "team_1" }),
        project: async () => ({ id: "prj_1", accountId: "team_1", autoExposeSystemEnvs: true }),
        inventory: vi.fn(), upsertSensitive };
      await expect(configureStagingDatabase({ cwd: linked, branch: "codex/release", env,
        git: { currentBranch: async () => "codex/release" }, vercel })).rejects.toThrow("CONFIGURE_RUN_ROOT_UNSAFE");
      expect(upsertSensitive).not.toHaveBeenCalled();
    } finally {
      rmSync(holder, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("từ chối readable inventory phân trang và không tạo proof", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-configure-readable-page-"));
    const rows = [row("DATABASE_URL"), row("DIRECT_URL")];
    const vercel = { linkage: async () => ({ projectId: "prj_1", teamId: "team_1" }),
      project: async () => ({ id: "prj_1", accountId: "team_1", autoExposeSystemEnvs: true }),
      inventory: async () => ({ envs: rows, pagination: {} }),
      upsertSensitive: async ({ key }: { key: string }) => row(key),
      readableConfig: async () => ({ values: { NEXT_PUBLIC_APP_ENV: "staging",
        NEXT_PUBLIC_SUPABASE_URL: "https://stage-ref.supabase.co", PUSH_DELIVERY_MODE: "log_only" },
      rows: readableRows, pagination: { next: 2 } }) };
    try {
      await expect(configureStagingDatabase({ cwd: root, branch: "codex/release", env,
        git: { currentBranch: async () => "codex/release" }, vercel }))
        .rejects.toThrow("CONFIGURE_ENV_INVENTORY_INCOMPLETE");
      expect(fs.existsSync(path.join(root, ".staging-test-runs", "deployment-environment-proof.json"))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("từ chối inventory phân trang trước mutation", async () => {
    const vercel = {
      linkage: async () => ({ projectId: "prj_1", teamId: "team_1" }),
      project: async () => ({ id: "prj_1", accountId: "team_1", autoExposeSystemEnvs: true }),
      inventory: async () => ({ envs: [], pagination: { next: 2 } }), upsertSensitive: vi.fn(),
    };
    await expect(configureStagingDatabase({ cwd: tmpdir(), branch: "codex/release", env,
      git: { currentBranch: async () => "codex/release" }, vercel })).rejects.toThrow("CONFIGURE_ENV_INVENTORY_INCOMPLETE");
    expect(vercel.upsertSensitive).not.toHaveBeenCalled();
  });

  it("từ chối nhiều row database cùng exact branch", async () => {
    const duplicates = [row("DATABASE_URL", "env_a"), row("DATABASE_URL", "env_b")];
    const vercel = {
      linkage: async () => ({ projectId: "prj_1", teamId: "team_1" }),
      project: async () => ({ id: "prj_1", accountId: "team_1", autoExposeSystemEnvs: true }),
      inventory: async () => ({ envs: duplicates, pagination: {} }), upsertSensitive: vi.fn(),
    };
    await expect(configureStagingDatabase({ cwd: tmpdir(), branch: "codex/release", env,
      git: { currentBranch: async () => "codex/release" }, vercel })).rejects.toThrow("CONFIGURE_BRANCH_ENV_AMBIGUOUS");
    expect(vercel.upsertSensitive).not.toHaveBeenCalled();
  });

  it("Vercel adapter chỉ truyền secret qua stdin bằng argv không shell", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-vercel-adapter-"));
    const calls: Array<{ executable: string; args: string[]; options: { input?: string; shell?: boolean } }> = [];
    try {
      fs.mkdirSync(path.join(root, ".vercel"));
      writeFileSync(path.join(root, ".vercel", "project.json"), JSON.stringify({ projectId: "prj_1", orgId: "team_1" }));
      const spawn = vi.fn((executable: string, args: string[], options: { input?: string; shell?: boolean }) => {
        calls.push({ executable, args, options });
        if (args.includes("update")) return { status: 0, stdout: "Updated\n" };
        if (!args.includes("POST") && args.some(argument => argument.includes("/env?"))) {
          const updated = row("DIRECT_URL");
          delete (updated as Partial<typeof updated>).customEnvironmentIds;
          return { status: 0, stdout: JSON.stringify({ envs: [updated], pagination: {} }) };
        }
        return { status: 0, stdout: JSON.stringify({ created: [row("DATABASE_URL")], failed: [] }) };
      });
      const { vercel } = createControlPlane({ cwd: root, spawn: controlSpawn(spawn) });
      await expect(vercel.linkage()).resolves.toEqual({ projectId: "prj_1", teamId: "team_1" });
      await expect(vercel.upsertSensitive({ projectId: "prj_1", teamId: "team_1", branch: "codex/release",
        key: "DATABASE_URL", value: "postgresql://u:adapter-secret@db/postgres", existingId: null }))
        .resolves.toEqual(row("DATABASE_URL"));
      await expect(vercel.upsertSensitive({ projectId: "prj_1", teamId: "team_1", branch: "codex/release",
        key: "DIRECT_URL", value: "postgresql://u:patch-secret@db/postgres", existingId: "env_DIRECT_URL" }))
        .resolves.toEqual(row("DIRECT_URL"));
      expect(JSON.parse(calls[0].options.input ?? "null")).toEqual([expect.objectContaining({
        key: "DATABASE_URL", type: "sensitive", target: ["preview"], gitBranch: "codex/release",
      })]);
      expect(calls).toHaveLength(3);
      expect(calls[0].executable).toBe(process.execPath);
      expect(calls[0].args).toEqual(expect.arrayContaining(["exec", "--yes", "--package=vercel@59.10.0", "--", "vercel", "--input", "-"]));
      expect(calls[0].options).toMatchObject({ cwd: root });
      expect(calls[0].args.join(" ")).not.toContain("adapter-secret");
      expect(calls[0].options).toMatchObject({ shell: false });
      expect(calls[0].options.input).toContain("adapter-secret");
      expect(calls[1].args).toEqual(expect.arrayContaining(["env", "update", "DIRECT_URL", "preview",
        "codex/release", "--sensitive", "--yes"]));
      expect(calls[1].args.join(" ")).not.toContain("patch-secret");
      expect(calls[1].options.input).toBe("postgresql://u:patch-secret@db/postgres");
      expect(calls[2].args.join(" ")).toContain("/v10/projects/prj_1/env?teamId=team_1&target=preview");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it.each([
    ["thiếu row", []],
    ["sai branch", [{ ...row("DIRECT_URL"), gitBranch: "codex/other" }]],
    ["trùng row khác id", [row("DIRECT_URL"), row("DIRECT_URL", "env_DIRECT_URL_other")]],
    ["custom env không phải array", [{ ...row("DIRECT_URL"), customEnvironmentIds: "custom" }]],
    ["custom env null", [{ ...row("DIRECT_URL"), customEnvironmentIds: null }]],
    ["custom env không rỗng", [{ ...row("DIRECT_URL"), customEnvironmentIds: ["env_custom"] }]],
  ])("fail closed khi inventory sau update %s", async (_case, envs) => {
    const spawn = vi.fn<BoundarySpawn>((_executable, args) => args.includes("update")
      ? { status: 0, stdout: "Updated\n" }
      : { status: 0, stdout: JSON.stringify({ envs, pagination: {} }) });
    const { vercel } = createControlPlane({ cwd: process.cwd(), spawn: controlSpawn(spawn) });
    await expect(vercel.upsertSensitive({ projectId: "prj_1", teamId: "team_1", branch: "codex/release",
      key: "DIRECT_URL", value: "postgresql://u:private@db/postgres", existingId: "env_DIRECT_URL" }))
      .rejects.toThrow("VERCEL_CONTROL_UPDATED_ENV_INVALID");
  });

  it("Vercel deployment list uses documented branch and sha query parameters", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-vercel-list-"));
    try {
      const spawn = vi.fn<BoundarySpawn>(() => ({ status: 0, stdout: JSON.stringify({ deployments: [], pagination: {} }) }));
      const { vercel } = createControlPlane({ cwd: root, spawn: controlSpawn(spawn) });
      await vercel.deployments({ projectId: "prj_1", teamId: "team_1", branch: "codex/release", sha: "a".repeat(40) });
      const endpoint = spawn.mock.calls[0][1].find((argument: string) => argument.startsWith("/v6/deployments?"));
      expect(endpoint).toContain("branch=codex%2Frelease");
      expect(endpoint).toContain(`sha=${"a".repeat(40)}`);
      expect(endpoint).toContain("limit=2");
      expect(endpoint).not.toContain("meta-githubCommitRef");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("Staging operator — cấu hình portable", () => {
  const stage = [
    "NEXT_PUBLIC_APP_ENV=staging", "VERCEL_ENV=preview", "TEST_BASE_URL=https://old.vercel.app",
    "PRODUCTION_BASE_URL=https://example.com", "TEST_STAGING_SUPABASE_REF=stage-ref",
    "NEXT_PUBLIC_SUPABASE_URL=https://stage-ref.supabase.co", "DATABASE_URL=postgresql://u:p@db/x",
    "DIRECT_URL=postgresql://u:p@db/x", "TEST_DEPLOYMENT_ID=old", "TEST_DEPLOYMENT_SHA=oldsha",
    "TEST_CUSTOMER_A_PHONE=1", "TEST_CUSTOMER_A_PASSWORD=a", "TEST_CUSTOMER_B_PHONE=2",
    "TEST_CUSTOMER_B_PASSWORD=b", "TEST_ADMIN_PHONE=3", "TEST_ADMIN_PASSWORD=c",
    "TEST_STAFF_PHONE=4", "TEST_STAFF_PASSWORD=d", "TEST_MAX_RUNTIME_MINUTES=60",
  ].join("\n");

  it("fail closed khi cấu hình đã ghép còn thiếu key bắt buộc", () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-operator-missing-"));
    try {
      writeFileSync(path.join(root, ".env.staging"), "DATABASE_URL=postgresql://u:p@db/x\n");
      writeFileSync(path.join(root, ".env.staging.local"), "TEST_ADMIN_PASSWORD=private\n");
      expect(() => loadOperatorEnvironment({ cwd: root })).toThrow("OPERATOR_ENV_KEYS_MISSING");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("dùng external config tuyệt đối từ process env mà không ghi pointer", () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-operator-root-"));
    const external = mkdtempSync(path.join(tmpdir(), "staging-operator-config-"));
    try {
      writeFileSync(path.join(external, ".env.staging"), `${stage}\n`);
      writeFileSync(path.join(external, ".env.staging.local"), "TEST_ADMIN_PASSWORD=local-secret\n");
      const env = loadOperatorEnvironment({ cwd: root, source: { NODE_ENV: "test", TEST_STAGING_CONFIG_DIR: external } });
      expect(env).toMatchObject({ TEST_ADMIN_PASSWORD: "local-secret", TEST_BASE_URL: "https://old.vercel.app" });
      expect(fs.existsSync(path.join(root, ".staging-test-runs", "config.json"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it("không spawn profile khi thiếu attestation", () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-operator-launch-"));
    try {
      writeFileSync(path.join(root, ".env.staging"), `${stage}\n`);
      writeFileSync(path.join(root, ".env.staging.local"), "TEST_ADMIN_PASSWORD=local-secret\n");
      const spawn = vi.fn(() => ({ status: 2 }));
      expect(() => launch({ cwd: root, profile: "recover", args: ["--run-id", "run_12345678"], spawn }))
        .toThrow("CONTROL_PLANE_ATTESTATION_MISSING");
      expect(spawn).not.toHaveBeenCalled();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("từ chối symlink cho env file", () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-operator-link-"));
    try {
      const outside = path.join(root, "outside.env");
      writeFileSync(outside, `${stage}\n`);
      symlinkSync(outside, path.join(root, ".env.staging"));
      writeFileSync(path.join(root, ".env.staging.local"), "TEST_ADMIN_PASSWORD=local-secret\n");
      expect(() => loadOperatorEnvironment({ cwd: root })).toThrow("OPERATOR_ENV_FILE_UNSAFE");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("từ chối external config có ancestor symlink", () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-operator-ancestor-root-"));
    const holder = mkdtempSync(path.join(tmpdir(), "staging-operator-ancestor-holder-"));
    const outside = mkdtempSync(path.join(tmpdir(), "staging-operator-ancestor-outside-"));
    try {
      writeFileSync(path.join(outside, ".env.staging"), `${stage}\n`);
      writeFileSync(path.join(outside, ".env.staging.local"), "TEST_ADMIN_PASSWORD=local-secret\n");
      const linked = path.join(holder, "linked-config");
      symlinkSync(outside, linked, "junction");
      expect(() => loadOperatorEnvironment({ cwd: root, source: { NODE_ENV: "test", TEST_STAGING_CONFIG_DIR: linked } }))
        .toThrow("OPERATOR_PATH_SYMLINK_FORBIDDEN");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(holder, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("từ chối config-dir tương đối từ process env", () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-operator-relative-"));
    const config = path.join(root, "config");
    try {
      fs.mkdirSync(config);
      writeFileSync(path.join(config, ".env.staging"), `${stage}\n`);
      writeFileSync(path.join(config, ".env.staging.local"), "TEST_ADMIN_PASSWORD=local-secret\n");
      expect(() => loadOperatorEnvironment({ cwd: root, source: { NODE_ENV: "test", TEST_STAGING_CONFIG_DIR: "config" } }))
        .toThrow("OPERATOR_CONFIG_DIRECTORY_ABSOLUTE_REQUIRED");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("package scripts dùng cùng launcher tracked cho mọi profile", () => {
    const scripts = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")).scripts;
    expect(scripts).toMatchObject({
      "test:live:staging:plan": "node scripts/staging-tests/operator.mjs plan",
      "test:live:staging:smoke": "node scripts/staging-tests/operator.mjs smoke",
      "test:live:staging:full": "node scripts/staging-tests/operator.mjs full",
      "test:live:staging:recover": "node scripts/staging-tests/operator.mjs recover",
      "test:live:staging:configure": "node scripts/staging-tests/configure-cli.mjs",
      "test:live:staging:attest": "node scripts/staging-tests/attest-cli.mjs",
    });
    expect(scripts).not.toHaveProperty("test:live:staging:setup");
  });

  it("từ chối input bị thay thế sau khi đã mở và luôn đóng handle", () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-operator-race-"));
    const file = path.join(root, ".env.staging");
    const backup = path.join(root, "opened.env");
    const replacement = path.join(root, "replacement.env");
    let closed = 0;
    try {
      writeFileSync(file, `${stage}\n`);
      writeFileSync(replacement, "DATABASE_URL=replaced\n");
      const facade = Object.assign(Object.create(fs), {
        readFileSync(target: string | number, encoding: BufferEncoding) {
          const contents = fs.readFileSync(target, encoding);
          if (typeof target === "number") {
            fs.renameSync(file, backup);
            fs.renameSync(replacement, file);
          }
          return contents;
        },
        closeSync(handle: number) { closed += 1; fs.closeSync(handle); },
      });
      expect(() => readVerifiedFile(file, facade)).toThrow("OPERATOR_ENV_FILE_CHANGED");
      expect(closed).toBe(1);
      expect(readFileSync(backup, "utf8")).toBe(`${stage}\n`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
