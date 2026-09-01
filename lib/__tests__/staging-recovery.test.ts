// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { classifyUnresolvedOperation } from "../../scripts/staging-tests/recovery.mjs";
import { executeRecovery } from "../../scripts/staging-tests/recover-run.mjs";
import { createJournal } from "../../scripts/staging-tests/journal.mjs";
import { createRunState } from "../../scripts/staging-tests/run-state.mjs";
import { fingerprint } from "../../scripts/staging-tests/database.mjs";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { preflightDouble, readDatabaseDouble } from "./staging-fixtures";

describe("Staging recovery — exact mutation reconciliation", () => {
  it("counter PENDING dùng đúng session STAFF của create intent để huỷ, không giả làm customer", async () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), "staging-counter-recover-"));
    const marker = "[STAGING:run_12345678:counter]";
    const journal = createJournal({ fs, rootDir: root, runId: "run_12345678", now: () => new Date() });
    journal.recordIntent("create", "op_12345678", { actor: "staff", marker, userId: "customer" });
    journal.recordOutcome("create", "op_12345678", "APPLIED");
    const state = createRunState({ fs, runDir: journal.runDir, initial: {
      target: { origin: "https://verified.vercel.app", supabaseRef: "staging", deploymentId: "d" },
      baselines: { customerB: { pointsBalance: 10, ledger: [], sessionIds: [] }, staff: { pointsBalance: 0, ledger: [], sessionIds: [] } },
      actorIds: { customerB: "customer", staff: "staff-user" }, catalogFingerprint: "catalog",
    } });
    state.addMarker(marker); state.addSession("staff", "staff-session");
    fs.mkdirSync(path.join(journal.runDir, "sessions"));
    fs.writeFileSync(path.join(journal.runDir, "sessions", "staff.json"), '{"refresh_token":"staff-run"}');
    const order = { id: "counter-order", user_id: "customer", status: "PENDING", order_type: "COUNTER", note: null,
      items: [{ note: marker }] };
    let staffSession: { id: string; user_id: string; expires_at: Date } | null = { id: "staff-session", user_id: "staff-user", expires_at: new Date("2099-01-01") };
    const fetchImpl = vi.fn(async (url: URL, init: RequestInit) => {
      if (url.pathname === "/api/auth/refresh") { staffSession = { ...staffSession!, id: "staff-session-renewed" };
        return new Response('{"data":{"success":true}}', { status: 200, headers: { "set-cookie": "refresh_token=staff-renewed; Path=/" } }); }
      if (url.pathname === "/api/staff/orders/counter-order" && init.method === "PATCH") { order.status = "CANCELLED"; return new Response('{"data":{"status":"CANCELLED"}}'); }
      if (url.pathname === "/api/auth/logout") { staffSession = null; return new Response('{"data":{"success":true}}', { headers: { "set-cookie": "refresh_token=; Max-Age=0; Path=/" } }); }
      if (url.pathname === "/api/auth/me") return new Response('{"code":"UNAUTHORIZED"}', { status: 401 });
      throw new Error(`Unexpected ${url.pathname}`);
    });
    const db = readDatabaseDouble({ ordersByMarkers: vi.fn(async () => [order]), order: vi.fn(async () => order),
      activeUses: vi.fn(async () => []), vouchers: vi.fn(async () => []),
      actorState: vi.fn(async (id: string) => ({ user: { points_balance: id === "customer" ? 10 : 0 }, ledger: [],
        vouchers: [], grants: [], sessions: id === "staff-user" && staffSession ? [staffSession] : [] })),
      session: vi.fn(async () => staffSession), sessionById: vi.fn(async () => staffSession),
      catalog: vi.fn(async () => ({ fingerprint: "catalog" })), close: vi.fn(async () => {}),
    });
    try {
      await expect(executeRecovery({ runRoot: root, runId: "run_12345678", fetchImpl,
        env: { TEST_BASE_URL: "https://verified.vercel.app", TEST_STAGING_SUPABASE_REF: "staging", TEST_DEPLOYMENT_ID: "d" },
        attestation: {}, preflightFn: vi.fn(async () => preflightDouble(db)),
      })).resolves.toMatchObject({ status: "PASS" });
      expect(fetchImpl.mock.calls.some(([url]) => (url as URL).pathname === "/api/orders/counter-order")).toBe(false);
      expect(order.status).toBe("CANCELLED");
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  it("đối soát refresh chỉ bằng cookie đã nhận, không lấy token từ DB", async () => {
    const entry = { type: "refresh", recovery: { actor: "customerB", userId: "u", sessionId: "s", baselineRefreshFingerprint: fingerprint("old-secret") } };
    const db = { session: vi.fn(async () => ({ id: "s-new", user_id: "u" })) };
    await expect(classifyUnresolvedOperation(entry, db, { capturedRefreshToken: "new-secret" })).resolves.toMatchObject({ state: "APPLIED" });
    await expect(classifyUnresolvedOperation(entry, db, { capturedRefreshToken: "old-secret" })).resolves.toMatchObject({ state: "AMBIGUOUS" });
    expect(db.session).toHaveBeenCalledTimes(1);
  });
  it("FAIL nếu journal chứng minh đã tạo nhưng không tìm được order audit", async () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), "staging-recover-"));
    const journal = createJournal({ fs, rootDir: root, runId: "run_12345678", now: () => new Date() });
    journal.recordIntent("create", "op_12345678", { marker: "[STAGING:run_12345678:lost]", userId: "u" });
    journal.recordOutcome("create", "op_12345678", "APPLIED");
    createRunState({ fs, runDir: journal.runDir, initial: {
      target: { origin: "https://verified.vercel.app", supabaseRef: "staging", deploymentId: "d" },
      baselines: { customerA: { pointsBalance: 10, ledger: [], sessionIds: [] } }, actorIds: { customerA: "u" }, catalogFingerprint: "catalog",
    } });
    const fetchImpl = vi.fn();
    const db = {
      ordersByMarkers: vi.fn(async () => []), activeUses: vi.fn(async () => []),
      actorState: vi.fn(async () => ({ user: { points_balance: 10 }, ledger: [], sessions: [] })),
      catalog: vi.fn(async () => ({ fingerprint: "catalog" })), close: vi.fn(),
    };
    try {
      await expect(executeRecovery({ runRoot: root, runId: "run_12345678", fetchImpl,
        env: { TEST_BASE_URL: "https://verified.vercel.app", TEST_STAGING_SUPABASE_REF: "staging", TEST_DEPLOYMENT_ID: "d" },
        attestation: {}, preflightFn: vi.fn(async () => preflightDouble(db)),
      })).rejects.toMatchObject({ code: "RECOVERY_ORDER_AUDIT_MISSING" });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  it("renew access đã hết hạn rồi huỷ đúng pending, thu hồi session; recovery lặp không mutation", async () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), "staging-recover-"));
    const marker = "[STAGING:run_12345678:pending]";
    const journal = createJournal({ fs, rootDir: root, runId: "run_12345678", now: () => new Date() });
    journal.recordIntent("create", "op_12345678", { marker, userId: "u" });
    journal.recordOutcome("create", "op_12345678", "APPLIED");
    const state = createRunState({ fs, runDir: journal.runDir, initial: {
      target: { origin: "https://verified.vercel.app", supabaseRef: "staging", deploymentId: "d" },
      baselines: { customerA: { pointsBalance: 10, ledger: [], sessionIds: [] } }, actorIds: { customerA: "u" }, catalogFingerprint: "catalog",
    } });
    state.addMarker(marker); state.addSession("customerA", "session");
    fs.mkdirSync(path.join(journal.runDir, "sessions"));
    fs.writeFileSync(path.join(journal.runDir, "sessions", "customerA.json"), '{"refresh_token":"run-only"}');
    const order = { id: "o", user_id: "u", status: "PENDING", order_type: "PICKUP", note: marker };
    let session: { id: string; user_id: string; expires_at: Date } | null = { id: "session", user_id: "u", expires_at: new Date("2099-01-01") };
    let accessFresh = false;
    const fetchImpl = vi.fn(async (url: URL, init: RequestInit) => {
      if (url.pathname === "/api/auth/refresh") { accessFresh = true; session = { ...session!, id: "session-renewed" };
        return new Response('{"data":{"success":true}}', { status: 200, headers: { "set-cookie": "refresh_token=renewed-run-only; Path=/; HttpOnly" } }); }
      if (url.pathname === "/api/orders/o" && !accessFresh) return new Response('{"code":"UNAUTHORIZED"}', { status: 401 });
      if (url.pathname === "/api/orders/o" && init.method === "PATCH") { order.status = "CANCELLED"; return new Response('{"data":{"status":"CANCELLED"}}', { status: 200 }); }
      if (url.pathname === "/api/auth/logout") { session = null; return new Response('{"data":{"success":true}}', { status: 200, headers: { "set-cookie": "refresh_token=; Max-Age=0; Path=/" } }); }
      if (url.pathname === "/api/auth/me") return new Response('{"code":"UNAUTHORIZED"}', { status: 401 });
      throw new Error("Unexpected request");
    });
    const db = {
      ordersByMarkers: vi.fn(async () => [order]), order: vi.fn(async () => order), activeUses: vi.fn(async () => []),
      actorState: vi.fn(async () => ({ user: { points_balance: 10 }, ledger: [], sessions: session ? [session] : [] })),
      session: vi.fn(async () => session), sessionById: vi.fn(async () => session),
      catalog: vi.fn(async () => ({ fingerprint: "catalog" })), close: vi.fn(),
    };
    try {
      const options = { runRoot: root, runId: "run_12345678", fetchImpl, env: { TEST_BASE_URL: "https://verified.vercel.app", TEST_STAGING_SUPABASE_REF: "staging", TEST_DEPLOYMENT_ID: "d" }, attestation: {}, preflightFn: vi.fn(async () => preflightDouble(db)) };
      await expect(executeRecovery(options)).resolves.toMatchObject({ status: "PASS" });
      expect(order.status).toBe("CANCELLED"); expect(session).toBeNull();
      expect(fetchImpl).toHaveBeenCalledTimes(4);
      await expect(executeRecovery(options)).resolves.toMatchObject({ status: "PASS" });
      expect(fetchImpl).toHaveBeenCalledTimes(4);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  it("recovery run đã huỷ không chạm voucher đang được order mới giữ và chạy lại không phát sinh write", async () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), "staging-recover-"));
    const marker = "[STAGING:run_12345678:cancelled]";
    const journal = createJournal({ fs, rootDir: root, runId: "run_12345678", now: () => new Date() });
    journal.recordIntent("create", "op_12345678", { marker, userId: "u" });
    journal.recordOutcome("create", "op_12345678", "APPLIED");
    const state = createRunState({ fs, runDir: journal.runDir, initial: {
      target: { origin: "https://verified.vercel.app", supabaseRef: "staging", deploymentId: "d" },
      baselines: { customerA: { pointsBalance: 10, ledger: [], sessionIds: [] } },
      actorIds: { customerA: "u" }, catalogFingerprint: "catalog",
    } });
    state.addMarker(marker); state.addVoucher("v");
    const fetchImpl = vi.fn();
    const db = {
      ordersByMarkers: vi.fn(async () => [{ id: "old", user_id: "u", status: "CANCELLED", note: marker }]),
      activeUses: vi.fn(async () => [{ id: "new-other-run" }]),
      vouchers: vi.fn(async () => [{ id: "v", status: "RESERVED" }]),
      actorState: vi.fn(async () => ({ user: { points_balance: 10 }, ledger: [], sessions: [] })),
      catalog: vi.fn(async () => ({ fingerprint: "catalog" })), close: vi.fn(),
    };
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await expect(executeRecovery({ runRoot: root, runId: "run_12345678", fetchImpl,
          env: { TEST_BASE_URL: "https://verified.vercel.app", TEST_STAGING_SUPABASE_REF: "staging", TEST_DEPLOYMENT_ID: "d" },
          attestation: {}, preflightFn: vi.fn(async () => preflightDouble(db)),
        })).resolves.toMatchObject({ status: "PASS" });
      }
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  it("không coi chưa thấy order là NOT_APPLIED khi request mất response có thể còn chạy", async () => {
    const result = await classifyUnresolvedOperation({
      type: "create", recovery: { marker: "[STAGING:run:case]", userId: "u" },
    }, { ordersByMarkers: vi.fn().mockResolvedValue([]) });
    expect(result.state).toBe("AMBIGUOUS");
  });
  it("không retry exchange bị mất response khi DB chứng minh voucher và ledger đã commit", async () => {
    const result = await classifyUnresolvedOperation({
      type: "exchange",
      recovery: { userId: "u", packageId: "p", baselineVoucherIds: ["old"], baselineLedgerIds: ["l0"], baselinePoints: 100 },
    }, { actorState: vi.fn().mockResolvedValue({
      user: { points_balance: 90 },
      vouchers: [{ id: "old", package_id: "other" }, { id: "new", package_id: "p" }],
      ledger: [{ id: "l0", delta: 5 }, { id: "l1", delta: -10, voucher_id: "new" }],
    }) });
    expect(result).toMatchObject({ state: "APPLIED", voucherId: "new" });
  });

  it("giữ AMBIGUOUS nếu marker khớp nhiều order thay vì tự huỷ bừa", async () => {
    const result = await classifyUnresolvedOperation({
      type: "create", recovery: { marker: "[STAGING:run:case]" },
    }, { ordersByMarkers: vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]) });
    expect(result).toEqual({ state: "AMBIGUOUS", code: "MULTIPLE_MARKER_ORDERS" });
  });

  it("đối soát status theo target và trạng thái nguồn đã đóng băng", async () => {
    const applied = await classifyUnresolvedOperation({
      type: "cancel", recovery: { orderId: "o", targetStatus: "CANCELLED", sourceStatuses: ["PENDING"] },
    }, { order: vi.fn().mockResolvedValue({ id: "o", status: "CANCELLED" }) });
    expect(applied.state).toBe("APPLIED");
  });
});
