// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { evaluateFinalState, reconcileRun } from "../../scripts/staging-tests/reconciliation.mjs";

const ledger = [{ id: "old", delta: 10, reason: "old", created_at: "2026-01-01T00:00:00Z" }];

describe("Staging reconciliation — audit và dữ liệu giữ chỗ", () => {
  it("FAIL nếu voucher vẫn RESERVED nhưng không còn order giữ nó", async () => {
    const result = await reconcileRun({
      db: {
        ordersByMarkers: vi.fn(async () => [{ id: "o", status: "CANCELLED" }]),
        activeUses: vi.fn(async () => []), vouchers: vi.fn(async () => [{ id: "v", status: "RESERVED" }]),
        catalog: vi.fn(async () => ({ fingerprint: "catalog" })),
        actorState: vi.fn(async () => ({ user: { points_balance: 100 }, ledger, sessions: [] })),
      },
      baselines: { customerA: { pointsBalance: 100, ledger, sessionIds: [] } }, actorIds: { customerA: "u" },
      markers: ["marker"], voucherIds: ["v"], initialCatalogFingerprint: "catalog", recovery: true,
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain("ORPHAN_VOUCHER_RESERVATION");
  });
  it("chấp nhận audit order terminal và ledger delta mới khớp số dư", () => {
    const result = evaluateFinalState({
      baseline: { pointsBalance: 100, ledger, sessionIds: ["existing"] },
      current: {
        pointsBalance: 95,
        ledger: [...ledger, { id: "new", delta: -5, reason: "exchange", created_at: "2026-01-02T00:00:00Z" }],
        sessionIds: ["existing"],
      },
      orders: [{ id: "kept", status: "CANCELLED" }], activeUses: [],
      initialCatalogFingerprint: "catalog", finalCatalogFingerprint: "catalog",
    });

    expect(result).toEqual({ ok: true, failures: [], newLedgerDelta: -5 });
  });

  it("FAIL nếu sửa ledger cũ, còn order nonterminal, reservation hoặc session run", () => {
    const result = evaluateFinalState({
      baseline: { pointsBalance: 100, ledger, sessionIds: ["existing"] },
      current: {
        pointsBalance: 100,
        ledger: [{ ...ledger[0], reason: "rewritten" }],
        sessionIds: ["existing", "run-session"],
      },
      runSessionIds: ["run-session"],
      orders: [{ id: "pending", status: "PENDING" }], activeUses: [{ id: "pending" }],
      initialCatalogFingerprint: "before", finalCatalogFingerprint: "after",
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(expect.arrayContaining([
      "BASELINE_LEDGER_CHANGED", "RUN_SESSION_REMAINS", "RUN_ORDER_NONTERMINAL",
      "RUN_VOUCHER_RESERVATION_REMAINS", "CATALOG_CHANGED",
    ]));
  });

  it("chấp nhận session run đã hết hạn như audit residue", () => {
    const result = evaluateFinalState({
      baseline: { pointsBalance: 100, ledger, sessionIds: ["existing"] },
      current: { pointsBalance: 100, ledger, sessionIds: ["existing", "rotated"],
        sessions: [{ id: "existing", expires_at: null }, { id: "rotated", expires_at: "2026-01-01T00:00:00Z" }] },
      runSessionIds: ["rotated"], orders: [], activeUses: [], now: () => Date.parse("2026-01-02T00:00:00Z"),
      initialCatalogFingerprint: "catalog", finalCatalogFingerprint: "catalog",
    });
    expect(result.ok).toBe(true);
  });

  it("đợi refresh grace rồi đối soát lại session read-only", async () => {
    let time = Date.parse("2026-01-01T00:00:00Z");
    const states = [
      { user: { points_balance: 100 }, ledger, sessions: [{ id: "existing", expires_at: null },
        { id: "predecessor", expires_at: new Date(time + 30_000).toISOString() }] },
      { user: { points_balance: 100 }, ledger, sessions: [{ id: "existing", expires_at: null },
        { id: "predecessor", expires_at: new Date(time - 1).toISOString() }] },
    ];
    const db = { ordersByMarkers: vi.fn(async () => []), activeUses: vi.fn(async () => []), vouchers: vi.fn(async () => []),
      catalog: vi.fn(async () => ({ fingerprint: "catalog" })), actorState: vi.fn(async () => states.shift()!) };
    const sleep = vi.fn(async (ms: number) => { time += ms; });
    const result = await reconcileRun({ db, baselines: { customerA: { pointsBalance: 100, ledger, sessionIds: ["existing"] } },
      actorIds: { customerA: "u" }, runSessionIds: { customerA: ["predecessor"] }, markers: [], voucherIds: [],
      initialCatalogFingerprint: "catalog", now: () => time, sleep, deadline: time + 31_000 });
    expect(result.ok).toBe(true);
    expect(sleep).toHaveBeenCalledOnce();
    expect(db.actorState).toHaveBeenCalledTimes(2);
  });

  it("fail closed khi deadline không đủ đợi refresh grace", async () => {
    const time = Date.parse("2026-01-01T00:00:00Z");
    const session = { id: "predecessor", expires_at: new Date(time + 30_000).toISOString() };
    const db = { ordersByMarkers: vi.fn(async () => []), activeUses: vi.fn(async () => []), vouchers: vi.fn(async () => []),
      catalog: vi.fn(async () => ({ fingerprint: "catalog" })), actorState: vi.fn(async () => ({
        user: { points_balance: 100 }, ledger, sessions: [session],
      })) };
    const sleep = vi.fn();
    const result = await reconcileRun({ db, baselines: { customerA: { pointsBalance: 100, ledger, sessionIds: [] } },
      actorIds: { customerA: "u" }, runSessionIds: { customerA: ["predecessor"] }, markers: [], voucherIds: [],
      initialCatalogFingerprint: "catalog", now: () => time, sleep, deadline: time + 10_000 });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain("RUN_SESSION_GRACE_DEADLINE_EXCEEDED");
    expect(sleep).not.toHaveBeenCalled();
  });
});
