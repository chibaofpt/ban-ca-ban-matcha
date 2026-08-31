// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import fs, { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { executePlan, executeSmoke, executeFull, runnerEnvironment } from "../../scripts/staging-tests/runner.mjs";
import { runnerBoundary } from "./staging-runner-boundary";
import { loadRunState } from "../../scripts/staging-tests/run-state.mjs";

describe("Staging runner — real owned flow, HTTP/DB boundaries only", () => {
  it.each([false, true])("newly acquired wallet reaches eligibility; original audit baseline remains frozen (fault=%s)", async fault => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-wallet-handoff-"));
    const boundary = runnerBoundary({ eligibilityAfterExchange: true, eligibilityWrongCode: fault });
    try {
      const result = await executeFull({ runRoot: root, runId: "run_12345678", ...boundary });
      expect(result.cases).toContainEqual(expect.objectContaining({ id: "concurrent-exchange", status: "PASS" }));
      expect(result.cases).toContainEqual(expect.objectContaining(fault
        ? { id: "voucher-eligibility", status: "FAIL", code: "ELIGIBILITY_MIN_ORDER_REJECTION_MISMATCH" }
        : { id: "voucher-eligibility-min-order", status: "PASS" }));
      const audit = loadRunState({ fs, runDir: path.join(root, "run_12345678") });
      expect(audit).toHaveProperty("baselines.customerB.pointsBalance", 100);
      expect(audit).toHaveProperty("baselines.customerB.ledger", []);
      const final = await boundary.db.actorState("b");
      expect(final.user.points_balance).toBe(90);
      expect(final.vouchers).toHaveLength(1);
      expect(final.ledger).toHaveLength(1);
      expect(boundary.requests.filter(request => request.method === "POST" && request.route === "/api/orders")).toHaveLength(3);
      if (fault) {
        expect(result.status).toBe("FAIL");
        for (const [id, code] of [["voucher-authorization", "AUTHORIZATION_STOPPED_AFTER_FAILURE"],
          ["counter-lifecycle", "COUNTER_STOPPED_AFTER_FAILURE"],
          ["online-final-freeship-redemption", "FINAL_FREESHIP_STOPPED_AFTER_FAILURE"]]) {
          expect(result.cases).toContainEqual({ id, status: "PARTIAL", code });
        }
      }
      expect(result.reconciliation).toEqual({ orderCount: 1, activeUseCount: 0 });
      expect(boundary.sessions.size).toBe(0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("full hết ngân sách auth sau preflight thì không gửi login dù chưa dùng slot nào", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-auth-deadline-"));
    const boundary = runnerBoundary({ usableMenu: false, discount: false });
    let clock = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const response = await boundary.fetchImpl(input, init);
      if (new URL(String(input)).pathname === "/api/store-status") clock = 31_000;
      return response;
    };
    try {
      const result = await executeFull({ runRoot: root, runId: "run_12345678", ...boundary, fetchImpl,
        env: { ...boundary.env, TEST_MAX_RUNTIME_MINUTES: "1" }, now: () => clock });
      expect(boundary.requests.filter(request => request.route === "/api/auth/login")).toEqual([]);
      expect(result.reasons).toContain("AUTH_TIME_BUDGET_INSUFFICIENT");
      expect(result.reconciliation).toEqual({ orderCount: 0, activeUseCount: 0 });
      expect(JSON.parse(JSON.stringify(result)).summary).toMatchObject({
        finalItems: { ordersCompleted: 0, pointsAwarded: 0 }, finalBundle: { ordersCompleted: 0 },
      });
      expect(boundary.sessions.size).toBe(0);
      expect(boundary.db.close).toHaveBeenCalledOnce();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("full giữ PARTIAL từ các prerequisite thực và vẫn đối soát, không bỏ qua hành trình bằng mock", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-full-runner-"));
    const boundary = runnerBoundary({ usableMenu: false, discount: false });
    try {
      const result = await executeFull({ runRoot: root, runId: "run_12345678", ...boundary });
      expect(result.status).toBe("PARTIAL");
      expect(result.cases).toContainEqual({ id: "bundle-voucher-lifecycle", status: "PARTIAL", code: "BUNDLE_ACTIVE_VOUCHER_MISSING" });
      expect(result.reasons).not.toContain("REQUIRED_CASE_NOT_IMPLEMENTED:bundle-voucher-lifecycle");
      expect(result.cases).toContainEqual(expect.objectContaining({ id: "voucher-eligibility", status: "PARTIAL" }));
      for (const name of ["min-order", "wrong-item", "wrong-size", "expired"]) {
        expect(result.cases).toContainEqual(expect.objectContaining({ id: `voucher-eligibility-${name}`, status: "PARTIAL" }));
      }
      expect(result.cases).toContainEqual({ id: "online-final-freeship-redemption", status: "PARTIAL", code: "FINAL_FREESHIP_ACTOR_UNAVAILABLE" });
      for (const type of ["product-discount", "addon", "item"]) {
        expect(result.cases).toContainEqual(expect.objectContaining({ id: `online-final-${type}-redemption`, status: "PARTIAL" }));
      }
      expect(result.cases).toContainEqual(expect.objectContaining({ id: "online-final-bundle-redemption", status: "PARTIAL" }));
      expect(result.cases).toContainEqual({ id: "freeship-min-order-rejection", status: "PARTIAL", code: "FREESHIP_ELIGIBILITY_ADDRESS_MISSING" });
      expect(result.cases).toContainEqual({ id: "online-final-voucher-redemption", status: "PARTIAL", code: "FINAL_VOUCHER_ACTOR_UNAVAILABLE" });
      expect(result.reasons).toContain("DELIVERY_ADDRESS_MISSING");
      expect(result.cases).toContainEqual({ id: "payment-expiry", status: "PARTIAL", code: "EXPIRY_ACTOR_UNAVAILABLE" });
      expect(result.cases).toContainEqual({ id: "concurrent-lifecycle", status: "PARTIAL",
        code: "LIFECYCLE_RACE_ACTOR_UNAVAILABLE" });
      expect(result.reasons).not.toContain("REQUIRED_CASE_NOT_IMPLEMENTED:concurrent-lifecycle");
      expect(result.reconciliation).toEqual({ orderCount: 0, activeUseCount: 0 });
      expect(JSON.parse(JSON.stringify(result)).summary).toMatchObject({
        finalItems: { ordersCompleted: 0, pointsAwarded: 0 }, finalBundle: { ordersCompleted: 0 },
      });
      expect(boundary.requests.filter(request => request.route === "/api/auth/login")).toHaveLength(1);
      expect(boundary.sessions.size).toBe(0);
      expect(boundary.db.close).toHaveBeenCalledOnce();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("full FAIL thắng thiếu prerequisite nếu logout làm sai số dư", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-full-fault-"));
    const boundary = runnerBoundary({ usableMenu: false, discount: false, corruptBalanceOnLogout: true });
    try {
      await expect(executeFull({ runRoot: root, runId: "run_12345678", ...boundary }))
        .rejects.toMatchObject({ code: "FULL_FINAL_RECONCILIATION_FAILED" });
      expect(boundary.sessions.size).toBe(0);
      expect(boundary.db.close).toHaveBeenCalledOnce();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("exchange race FAIL thì đối soát nhưng không chạy bất kỳ order journey phía sau", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-exchange-stop-"));
    const boundary = runnerBoundary({ usableMenu: false, discount: false, exchangeFail: true });
    try {
      const result = await executeFull({ runRoot: root, runId: "run_12345678", ...boundary });
      expect(result.status).toBe("FAIL");
      expect(result.cases).toContainEqual({ id: "concurrent-exchange", status: "FAIL",
        code: "EXCHANGE_RACE_WINNER_COUNT_INVALID" });
      expect(boundary.requests.some(request => request.route === "/api/orders")).toBe(false);
      expect(boundary.requests.filter(request => request.route === "/api/profile/vouchers/exchange")).toHaveLength(2);
      expect(result.reconciliation).toEqual({ orderCount: 0, activeUseCount: 0 });
      expect(JSON.parse(JSON.stringify(result)).summary).toMatchObject({
        finalItems: { ordersCompleted: 0, pointsAwarded: 0 }, finalBundle: { ordersCompleted: 0 },
      });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("full chặn exchange tại raw-dispatch boundary khi cửa sổ riêng không còn đủ deadline", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-exchange-deadline-"));
    const boundary = runnerBoundary({ usableMenu: true, discount: true, exchangeFail: true });
    let clock = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const response = await boundary.fetchImpl(input, init);
      const url = new URL(String(input));
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      if (url.pathname === "/api/auth/login"
        && body?.phone_number?.endsWith(boundary.env.TEST_CUSTOMER_B_PHONE.slice(-9))) {
        clock = 91_000;
      }
      return response;
    };
    try {
      const result = await executeFull({ runRoot: root, runId: "run_12345678", ...boundary, fetchImpl,
        env: { ...boundary.env, TEST_MAX_RUNTIME_MINUTES: "2" }, now: () => clock });
      expect(boundary.requests.filter(request => request.route === "/api/profile/vouchers/exchange")).toEqual([]);
      expect(result.cases).toContainEqual({ id: "concurrent-exchange", status: "PARTIAL",
        code: "VOUCHER_EXCHANGE_TIME_BUDGET_INSUFFICIENT" });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("expiry ambiguity đóng cầu dao ghi chung; không mutation nào dispatch sau đó", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-expiry-gate-"));
    const clockRef = { value: Date.parse("2026-08-31T00:00:00Z") };
    const boundary = runnerBoundary({ usableMenu: true, discount: false, expiryAmbiguous: true, clockRef });
    try {
      await expect(executeFull({ runRoot: root, runId: "run_12345678", ...boundary,
        now: () => clockRef.value, sleep: async ms => { clockRef.value += ms; } }))
        .rejects.toMatchObject({ code: "MUTATION_OUTCOME_AMBIGUOUS" });
      const confirmation = boundary.requests.findIndex(request => request.method === "PATCH"
        && request.route.endsWith("/confirm-payment"));
      expect(confirmation).toBeGreaterThanOrEqual(0);
      expect(boundary.requests.slice(confirmation + 1).filter(request => ["POST", "PATCH", "DELETE"].includes(request.method))).toEqual([]);
      expect(boundary.sessions.size).toBeGreaterThan(0);
      expect(boundary.db.close).toHaveBeenCalledOnce();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("main ambiguity đóng cầu dao trước admin login/confirm/cleanup của expiry", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-main-gate-"));
    const clockRef = { value: Date.parse("2026-08-31T00:00:00Z") };
    const boundary = runnerBoundary({ usableMenu: true, discount: false, expiryAmbiguous: true,
      mainOrderAmbiguous: true, clockRef });
    let releaseWait = () => {};
    const running = executeFull({ runRoot: root, runId: "run_12345678", ...boundary,
      now: () => clockRef.value, sleep: () => new Promise<void>(resolve => {
        releaseWait = () => { clockRef.value += 1_300_000; resolve(); };
      }) });
    try {
      await vi.waitFor(() => expect(boundary.requests.filter(request => request.route === "/api/orders")).toHaveLength(2));
      releaseWait();
      await expect(running).rejects.toMatchObject({ code: "MUTATION_OUTCOME_AMBIGUOUS" });
      expect(boundary.requests.some(request => request.route.endsWith("/confirm-payment"))).toBe(false);
      const lostMain = boundary.requests.map(request => `${request.method} ${request.route}`).lastIndexOf("POST /api/orders");
      expect(boundary.requests.slice(lostMain + 1).filter(request => ["POST", "PATCH", "DELETE"].includes(request.method))).toEqual([]);
      expect(boundary.sessions.size).toBeGreaterThan(0);
      expect(boundary.db.close).toHaveBeenCalledOnce();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("full từ chối time budget vượt 60 phút trước HTTP/DB", async () => {
    const openDatabase = vi.fn();
    const fetchImpl = vi.fn();
    await expect(executeFull({ runRoot: "unused", runId: "run_12345678", attestation: {},
      env: { TEST_MAX_RUNTIME_MINUTES: "61" }, openDatabase, fetchImpl })).rejects.toMatchObject({ code: "RUN_TIME_BUDGET_INVALID" });
    expect(openDatabase).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("plan thực chỉ GET/DB đọc, không nhầm data-ready với implemented", async () => {
    const boundary = runnerBoundary();
    const result = await executePlan(boundary);
    expect(result.status).toBe("PARTIAL");
    expect(result.summary.smoke).toMatchObject({ pointsNeeded: 0, voucherTypes: ["DISCOUNT"] });
    expect(result.summary.full).toMatchObject({
      implementedCases: expect.arrayContaining(["plain-pickup-cancel", "price-changed", "online-lifecycle", "payment-expiry"]),
      pendingImplementationCases: [],
    });
    expect(result.summary.full.pendingImplementationCases).not.toContain("concurrent-lifecycle");
    expect(result.summary.full.pendingImplementationCases).not.toContain("concurrent-exchange");
    expect(result.summary.full.pendingImplementationCases).not.toContain("bundle-voucher-lifecycle");
    expect(result.summary.full.pendingImplementationCases).not.toContain("online-final-voucher-redemption");
    expect(result.summary.full.pendingImplementationCases).not.toContain("product-surplus-aggregation");
    expect(result.summary.full.pendingImplementationCases).not.toContain("voucher-ownership-expiry-eligibility");
    expect(result.summary.full.conservativeSchedule).toEqual({
      customerBCreateAttemptCeiling: 39, earliestLastCustomerBCreateMs: 4_207_000,
      runtimeLimitMinutes: 60, rateWindowFitsWithCleanupReserve: false,
      cleanupReserveMs: 60_000, includesHttpLatency: false,
    });
    expect(result.cases.full.find((item: { id: string }) => item.id === "payment-expiry")).toMatchObject({ implementationStatus: "IMPLEMENTED", runnable: false });
    expect(result.cases.full.find((item: { id: string }) => item.id === "voucher-matrix"))
      .toMatchObject({ implementationStatus: "IMPLEMENTED" });
    expect(boundary.requests).toHaveLength(4);
    expect(boundary.requests.every(request => request.method === "GET")).toBe(true);
    expect(boundary.sessions.size).toBe(0);
    expect(boundary.db.close).toHaveBeenCalledOnce();
  });

  it("không chuyển toàn bộ process.env tùy ý vào runner", () => {
    expect(runnerEnvironment({ TEST_BASE_URL: "https://x", RANDOM_SECRET: "no" })).toEqual(expect.objectContaining({ TEST_BASE_URL: "https://x" }));
    expect(runnerEnvironment({ RANDOM_SECRET: "no" })).not.toHaveProperty("RANDOM_SECRET");
  });

  it("read-only plan exposes infeasible fully provisioned time window without granting writes", async () => {
    const boundary = runnerBoundary();
    vi.mocked(boundary.db.recentOrders).mockResolvedValue(Array.from({ length: 5 }, (_, index) => ({
      id: `old-${index}`, created_at: new Date(Date.now() - 60_000),
    })));
    const result = await executePlan({ ...boundary, env: { ...boundary.env, TEST_MAX_RUNTIME_MINUTES: "50" } });
    expect(result.summary.full.conservativeSchedule).toMatchObject({ earliestLastCustomerBCreateMs: 4_808_000,
      runtimeLimitMinutes: 50, rateWindowFitsWithCleanupReserve: false, includesHttpLatency: false });
    expect(boundary.requests.every(request => request.method === "GET")).toBe(true);
    expect(boundary.sessions.size).toBe(0);
  });

  it("smoke thực chạy ba đơn, giữ audit và thu hồi session trước PASS", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "staging-smoke-runner-"));
    const boundary = runnerBoundary();
    try {
      const result = await executeSmoke({ runRoot: root, runId: "run_12345678", ...boundary });
      expect(result).toMatchObject({ status: "PASS", summary: { ordersCreated: 3, exchanged: false },
        reconciliation: { orderCount: 3, activeUseCount: 0 } });
      expect([...boundary.orders.values()].map(order => order.status)).toEqual(["CANCELLED", "CANCELLED", "CANCELLED"]);
      expect(boundary.requests.filter(request => request.method === "POST" && request.route === "/api/orders")).toHaveLength(3);
      const runState = loadRunState({ fs, runDir: path.join(root, "run_12345678") });
      expect(runState.markers).toHaveLength(3);
      expect(runState.runSessionIds.customerA).toHaveLength(1);
      expect(boundary.sessions.size).toBe(0);
      expect(existsSync(path.join(root, "run_12345678", "sessions", "customerA.json"))).toBe(false);
      expect(boundary.db.close).toHaveBeenCalledOnce();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
