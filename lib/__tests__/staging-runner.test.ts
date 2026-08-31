// @vitest-environment node

import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { combineStatus, redact, statusExitCode, validateRunId, validateTarget } from "../../scripts/staging-tests/core.mjs";
import { createJournal, journalNeedsRecovery } from "../../scripts/staging-tests/journal.mjs";

const targetEnv = {
  NEXT_PUBLIC_APP_ENV: "staging", VERCEL_ENV: "preview", TEST_BASE_URL: "https://release-123.vercel.app", PRODUCTION_BASE_URL: "https://example.com",
  TEST_STAGING_SUPABASE_REF: "stage-ref", NEXT_PUBLIC_SUPABASE_URL: "https://stage-ref.supabase.co",
  DATABASE_URL: "postgresql://postgres.stage-ref:secret@pooler.supabase.com/db",
  TEST_DEPLOYMENT_ID: "deploy-1", TEST_DEPLOYMENT_SHA: "abc123",
};
const targetProof = {
  source: "vercel-mcp", deploymentOrigin: "https://release-123.vercel.app",
  environment: "preview", appEnvironment: "staging", supabaseRef: "stage-ref",
  apiDatabaseFingerprint: "same-catalog", databaseFingerprint: "same-catalog",
  deploymentId: "deploy-1", deploymentSha: "abc123", pushMode: "log_only", pushGuardVerified: true,
  databaseBinding: { deploymentId: "deploy-1", deploymentSha: "abc123", supabaseRef: "stage-ref", source: "deployment-environment", verified: true },
  immutableDeployment: true,
  verifiedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
};

describe("Staging runner — guard mục tiêu", () => {
  it("catalog giống nhau không thay thế bằng chứng DATABASE_URL của chính deployment", () => {
    expect(validateTarget(targetEnv, { ...targetProof, databaseBinding: undefined }).ok).toBe(false);
  });
  it("fail closed khi thiếu toàn bộ bằng chứng staging", () => {
    const result = validateTarget({});

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("NEXT_PUBLIC_APP_ENV must equal staging");
    expect(result.errors).toContain("TEST_BASE_URL must be a credential-free HTTPS origin");
  });

  it("fail closed khi thiếu production origin dù staging còn lại hợp lệ", () => {
    const result = validateTarget({
      NEXT_PUBLIC_APP_ENV: "staging", VERCEL_ENV: "preview", TEST_BASE_URL: "https://staging.example.com",
      TEST_STAGING_SUPABASE_REF: "stage-ref", NEXT_PUBLIC_SUPABASE_URL: "https://stage-ref.supabase.co",
      DATABASE_URL: "postgresql://postgres.stage-ref:secret@pooler.supabase.com/db",
      TEST_DEPLOYMENT_ID: "deploy-1", TEST_DEPLOYMENT_SHA: "abc123",
    }, { ...targetProof, deploymentOrigin: "https://staging.example.com" });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("PRODUCTION_BASE_URL must be a credential-free HTTPS origin");
  });

  it("không dùng attestation đã hết hạn để mở quyền ghi staging", () => {
    const result = validateTarget(targetEnv, { ...targetProof, verifiedAt: "2000-01-01T00:00:00Z", expiresAt: "2000-01-01T01:00:00Z" });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Control-plane attestation is stale or invalid");
  });

  it("từ chối chứng cứ deployment trỏ production dù tên biến ghi staging", () => {
    const result = validateTarget(targetEnv, { ...targetProof, environment: "production", deploymentOrigin: "https://example.com" });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Control-plane target does not identify this staging deployment");
  });

  it("chặn profile ghi nếu chưa chứng minh push đang ở log_only", () => {
    const result = validateTarget(targetEnv, { ...targetProof, pushMode: "deliver", pushGuardVerified: false }, true);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Verified staging log_only push mode is required for writes");
  });
});

describe("Staging runner — báo cáo và recovery", () => {
  it("recovery không PASS chỉ vì journal đã APPLIED khi chưa đối soát DB và session", () => {
    const temporary = mkdtempSync(path.join(tmpdir(), "bcbm-recovery-"));
    try {
      const run = path.join(temporary, ".staging-test-runs", "run_12345678");
      mkdirSync(run, { recursive: true });
      writeFileSync(path.join(run, "journal.ndjson"), JSON.stringify({ state: "APPLIED", type: "create", operationId: "op_12345678" }) + "\n");
      const result = spawnSync(process.execPath, [path.resolve("scripts/staging-tests/cli.mjs"), "recover", "--run-id", "run_12345678"], {
        cwd: temporary, encoding: "utf8", env: { NODE_ENV: "test" }, timeout: 10_000,
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('"status":"FAIL"');
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });
  it("CLI trả FAIL khi journal recovery còn mutation chưa rõ", () => {
    const temporary = mkdtempSync(path.join(tmpdir(), "bcbm-runner-"));
    try {
      const run = path.join(temporary, ".staging-test-runs", "run_12345678");
      mkdirSync(run, { recursive: true });
      writeFileSync(path.join(run, "journal.ndjson"), JSON.stringify({
        state: "INTENT", type: "create", operationId: "op_12345678",
      }) + "\n");
      const result = spawnSync(process.execPath, [path.resolve("scripts/staging-tests/cli.mjs"), "recover", "--run-id", "run_12345678"], {
        cwd: temporary, encoding: "utf8", env: { NODE_ENV: "test" }, timeout: 10_000,
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('"status":"FAIL"');
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("chỉ PASS khi API, database và deployment cùng bằng chứng staging", () => {
    const result = validateTarget(targetEnv, targetProof);
    expect(result).toMatchObject({ ok: true, errors: [] });
  });

  it("che mọi secret và định danh recovery khỏi report", () => {
    expect(redact({ password: "pw", cookie: "sid=x", database_url: "postgres://u:p@db/x", nested: { qr_token: "qr", user_id: "u" } })).toEqual({
      password: "[REDACTED]", cookie: "[REDACTED]", database_url: "[REDACTED]",
      nested: { qr_token: "[REDACTED]", user_id: "[REDACTED]" },
    });
  });

  it("FAIL thắng PARTIAL và ánh xạ đúng exit code", () => {
    expect(combineStatus(["PASS", "PARTIAL", "FAIL"])).toBe("FAIL");
    expect([statusExitCode("PASS"), statusExitCode("FAIL"), statusExitCode("PARTIAL")]).toEqual([0, 1, 2]);
  });

  it("ghi intent bền vững trước outcome và dừng khi ambiguous", () => {
    const writes: string[] = [];
    const fakeFs = { mkdirSync: () => undefined, appendFileSync: (_path: string, value: string) => { writes.push(value); } };
    const journal = createJournal({ fs: fakeFs, rootDir: "C:/runs", runId: "run_12345678", now: () => new Date("2026-01-01T00:00:00Z") });
    const intent = journal.recordIntent("create", "op_12345678", { order_public_code: "BCBM-TEST" });
    const ambiguous = journal.recordOutcome("create", "op_12345678", "AMBIGUOUS");
    expect(writes).toHaveLength(2);
    expect(JSON.parse(writes[0])).toMatchObject({ state: "INTENT", type: "create", operationId: "op_12345678" });
    expect(journalNeedsRecovery([intent, ambiguous])).toBe(true);
  });

  it("xem INTENT chưa có outcome cùng operationId là chưa được giải quyết", () => {
    expect(journalNeedsRecovery([
      { state: "INTENT", type: "create", operationId: "op_12345678" },
      { state: "APPLIED", type: "create", operationId: "op_87654321" },
    ])).toBe(true);
  });

  it("recovery chỉ nhận exact run id, không nhận path", () => {
    expect(validateRunId("run_12345678")).toBe("run_12345678");
    expect(() => validateRunId("../all-runs")).toThrow("Invalid exact run id");
  });

  it("không chấp nhận database giả chỉ chứa staging ref trong hostname", () => {
    const result = validateTarget({
      NEXT_PUBLIC_APP_ENV: "staging", VERCEL_ENV: "preview", TEST_BASE_URL: "https://staging.example.com", PRODUCTION_BASE_URL: "https://example.com",
      TEST_STAGING_SUPABASE_REF: "stage-ref", NEXT_PUBLIC_SUPABASE_URL: "https://stage-ref.supabase.co",
      DATABASE_URL: "postgresql://postgres:example@stage-ref.evil.example/db",
      TEST_DEPLOYMENT_ID: "deploy-1", TEST_DEPLOYMENT_SHA: "abc123",
    }, { ...targetProof, deploymentOrigin: "https://staging.example.com" });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Database host or user must match staging ref");
  });
});
