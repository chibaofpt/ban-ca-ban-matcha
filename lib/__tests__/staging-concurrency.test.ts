// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { runVoucherConcurrency } from "../../scripts/staging-tests/journeys/concurrency.mjs";
import { createJournal } from "../../scripts/staging-tests/journal.mjs";
import { runLifecycleConcurrency } from "../../scripts/staging-tests/journeys/lifecycle-concurrency.mjs";
import { AmbiguousMutation } from "../../scripts/staging-tests/http.mjs";
import { PrerequisiteMissing } from "../../scripts/staging-tests/errors.mjs";
import { runExchangeConcurrency } from "../../scripts/staging-tests/journeys/exchange-concurrency.mjs";

function lifecycleBoundary(mode = "normal") {
  const states = Object.fromEntries([["customerB", "CUSTOMER"], ["staff", "STAFF"], ["admin", "ADMIN"]].map(([name, role]) =>
    [name, { user: { id: name, role, points_balance: 100 }, sessions: [{ id: `old-${name}` }],
      vouchers: [], grants: [], ledger: [{ id: `old-${name}`, delta: 100, reason: "manual_admin_adjustment" }] }])) as Record<string, {
      user: { id: string; role: string; points_balance: number }; sessions: { id: string }[];
      vouchers: unknown[]; grants: unknown[]; ledger: Record<string, unknown>[] }>;
  const orders = new Map<string, Record<string, unknown>>();
  const writes: Array<{ actor: string; path: string; target: unknown }> = [];
  const entries: Array<{ state: string; recovery?: Record<string, unknown> }> = [];
  const arrivals = [0, 0];
  const releases: Array<() => void> = [];
  const barriers = [0, 1].map(() => new Promise<void>(resolve => releases.push(resolve)));
  const logouts: string[] = [];
  const api = (actor: string) => ({ async request(path: string, options: { method?: string; body?: Record<string, unknown> } = {}) {
    const id = path.split("/").filter(Boolean).at(path.endsWith("confirm-payment") ? -2 : -1)!;
    if (!options.method) return { ok: true, status: 200, body: { data: structuredClone(orders.get(id)) } };
    writes.push({ actor, path, target: options.body?.status });
    expect(entries.filter(entry => entry.state === "INTENT").length).toBeGreaterThanOrEqual(writes.length);
    if (path === "/api/orders") {
      const order = { id: `order-${orders.size + 1}`, user_id: "customerB", status: "PENDING", order_type: "PICKUP", note: options.body?.note,
        subtotal_vnd: 17_000, total_voucher_discount_vnd: 0, total_vnd: 17_000, shipping_fee_vnd: 0,
        freeship_discount_vnd: 0, grand_total_vnd: 17_000, points_earned: null, payment_confirmed_by: null,
        created_at: new Date(0).toISOString(), payment_confirmed_at: null, handled_by: null,
        discountVouchers: [], bundleApplications: [], freeship_voucher_id: null,
        items: (options.body?.items as Record<string, unknown>[]).map(item => ({ ...item, unit_price_vnd: 17_000,
          addons_price_vnd: 0, selected_powder_id: "powder", selected_milk_type_id: "milk", base_liquid_ml: 100,
          product_voucher_id: null, item_voucher_id: null, addonVouchers: [], addons: [] })) };
      orders.set(order.id, order); return { ok: true, status: 201, body: { data: structuredClone(order) } };
    }
    const order = orders.get(id)!;
    const target = options.body?.status;
    const race = id === "order-1" && (actor === "customerB" || path.endsWith("confirm-payment")) ? 0
      : target === "COMPLETED" ? 1 : -1;
    if (race >= 0) {
      arrivals[race] += 1; if (arrivals[race] === 2) releases[race](); await barriers[race];
      if (mode === "ambiguous" && race === 0) throw new AmbiguousMutation();
      if (["cancel-wins", "cancel-payment-time"].includes(mode) && race === 0 && actor === "admin") await Promise.resolve();
    }
    const refuse = (status: number, code: string) => ({ ok: false, status, body: { code } });
    if (path.endsWith("confirm-payment")) {
      if (order.status !== "PENDING") return refuse(409, "STATUS_CONFLICT");
      order.status = "ADMIN_CONFIRMED"; order.payment_confirmed_by = "admin";
      if (mode !== "missing-payment-time") order.payment_confirmed_at = new Date(0).toISOString();
    } else if (actor === "customerB") {
      if (order.status !== "PENDING") return refuse(409, "CONFLICT");
      order.status = "CANCELLED";
      if (mode === "cancel-payment-time") order.payment_confirmed_at = new Date(0).toISOString();
    } else if (target === "CANCELLED") order.status = "CANCELLED";
    else if (target === "STAFF_DONE") {
      order.status = "STAFF_DONE"; order.handled_by = mode === "wrong-handler" ? "other" : "staff";
      if (mode === "bad-snapshot") (order.items as Record<string, unknown>[])[0].sweetness = "NONE";
    }
    else if (target === "COMPLETED") {
      if (order.status === "COMPLETED") {
        if (mode === "double-complete") return { ok: true, status: 200, body: { data: structuredClone(order) } };
        if (mode === "double-award") { states.customerB.user.points_balance++; states.customerB.ledger.push({ id: "duplicate", delta: 1 }); }
        return refuse(400, "INVALID_TRANSITION");
      }
      order.status = "COMPLETED"; order.points_earned = 1; states.customerB.user.points_balance++;
      states.customerB.ledger.push({ id: "earned", order_id: id, user_id: "customerB", reason: "order_complete", delta: 1, performed_by: "staff",
        voucher_id: mode === "linked-voucher" ? "unexpected" : null, reversed_log_id: mode === "linked-reversal" ? "unexpected" : null });
    } else throw new Error("Unexpected mutation");
    return { ok: true, status: 200, body: { data: structuredClone(order) } };
  } });
  const ctx = { runId: "run_12345678", runDir: "unused", origin: "https://test.invalid", now: () => 0, deadline: 3_600_000,
    actorStates: structuredClone(states), credentials: Object.fromEntries(Object.keys(states).map(name => [name, { phone: "+84900000000", password: "synthetic" }])),
    catalog: { fingerprint: "catalog", items: [{ id: "latte", category: "latte", is_available: true, matcha_powder_id: "powder",
      sizes: [{ size: "SMALL", base_price_vnd: 10_000 }] }], powders: [{ id: "powder", price_per_gram: 2_000, powderSizeConfigs: [] }],
      liquids: [{ id: "milk", is_default: true, price_per_ml: 10 }], defaults: [{ size: "SMALL", powder_gram: 3, milk_ml: 100 }], addonGroups: [] },
    journal: createJournal({ rootDir: "D:/journal-double", runId: "run_12345678", now: () => new Date(0),
      fs: { mkdirSync() {}, appendFileSync(_path: string, content: string) { entries.push(JSON.parse(content)); } } }),
    pacer: { reserve: vi.fn(async () => {}) }, runState: { addMarker: vi.fn(), addSession: vi.fn() },
    actorLifecycle: { async login({ name }: { name: string }) { states[name].sessions.push({ id: `run-${name}` }); return { name, api: api(name), sessionId: `run-${name}` }; },
      async logout(actor: { name: string }) { logouts.push(actor.name); states[actor.name].sessions = [{ id: `old-${actor.name}` }]; } },
    db: { async actorState(id: string) { return structuredClone(states[id]); }, async order(id: string) { return structuredClone(orders.get(id)); },
      async ordersByMarkers(markers: string[]) { return structuredClone([...orders.values()].filter(order => markers.includes(String(order.note)))); },
      async catalog() { return { fingerprint: "catalog" }; } },
  };
  return { ctx, states, orders, writes, entries, arrivals, logouts };
}

describe("Runner race lifecycle online — boundary doubles, không phải bằng chứng DB", () => {
  it("ledger order_complete không được mang voucher hoặc reversed_log liên kết", async () => {
    for (const mode of ["linked-voucher", "linked-reversal"]) {
      const { ctx } = lifecycleBoundary(mode);
      expect(await runLifecycleConcurrency(ctx)).toMatchObject({ status: "FAIL", code: "LIFECYCLE_RACE_LEDGER_INVALID" });
    }
  });
  it("customer thắng cancel thì không được có payment timestamp", async () => {
    const { ctx } = lifecycleBoundary("cancel-payment-time");
    expect(await runLifecycleConcurrency(ctx)).toMatchObject({ status: "FAIL", code: "LIFECYCLE_RACE_PAYMENT_TIME_INVALID" });
  });
  it("thiếu thời gian PARTIAL vẫn phát hiện số dư bị ghi sai trong cleanup", async () => {
    const { ctx, orders, states } = lifecycleBoundary();
    ctx.now = () => orders.size ? 3_500_000 : 0;
    const logout = ctx.actorLifecycle.logout;
    ctx.actorLifecycle.logout = async actor => { await logout(actor); if (actor.name === "customerB") states.customerB.user.points_balance++; };
    expect(await runLifecycleConcurrency(ctx)).toMatchObject({ status: "FAIL", code: "LIFECYCLE_RACE_POINTS_INVALID", recoveryRequired: true });
  });
  it("thiếu timestamp xác nhận không được PASS dù admin đúng", async () => {
    const { ctx } = lifecycleBoundary("missing-payment-time");
    expect(await runLifecycleConcurrency(ctx)).toMatchObject({ status: "FAIL", code: "LIFECYCLE_RACE_PAYMENT_TIME_INVALID" });
  });
  it("settle đủ hai contender mỗi race và chỉ giữ một ledger 1 điểm trên đơn 17.000 đồng", async () => {
    const { ctx, states, orders, arrivals, logouts } = lifecycleBoundary();
    expect(await runLifecycleConcurrency(ctx)).toMatchObject({ status: "PASS", summary: { races: 2, pointsAwarded: 1 } });
    expect(arrivals).toEqual([2, 2]);
    expect([...orders.values()].map(order => order.status)).toEqual(["CANCELLED", "COMPLETED"]);
    expect(states.customerB.user.points_balance).toBe(101);
    expect(states.customerB.ledger).toHaveLength(2);
    expect(logouts.sort()).toEqual(["admin", "customerB", "staff"]);
    expect(ctx.pacer.reserve).toHaveBeenCalledTimes(2);
  });
  it("từ chối snapshot lựa chọn món bị thay đổi sau chuẩn bị", async () => {
    const { ctx } = lifecycleBoundary("bad-snapshot");
    expect(await runLifecycleConcurrency(ctx)).toMatchObject({ status: "FAIL", code: "LIFECYCLE_RACE_SNAPSHOT_INVALID" });
  });
  it("chấp nhận customer thắng race và không gửi thêm cancellation cho đơn terminal", async () => {
    const { ctx, writes, orders } = lifecycleBoundary("cancel-wins");
    expect(await runLifecycleConcurrency(ctx)).toMatchObject({ status: "PASS" });
    expect(orders.get("order-1")).toMatchObject({ status: "CANCELLED", payment_confirmed_by: null });
    expect(writes.filter(write => write.actor === "admin" && write.target === "CANCELLED")).toEqual([]);
  });
  it("phát hiện hai completion thành công dù database chỉ giữ một ledger", async () => {
    const { ctx, arrivals } = lifecycleBoundary("double-complete");
    expect(await runLifecycleConcurrency(ctx)).toMatchObject({ status: "FAIL", code: "LIFECYCLE_RACE_WINNER_COUNT_INVALID" });
    expect(arrivals).toEqual([2, 2]);
  });
  it("phát hiện loser trả lỗi nhưng vẫn cộng thêm ledger và điểm", async () => {
    const { ctx } = lifecycleBoundary("double-award");
    expect(await runLifecycleConcurrency(ctx)).toMatchObject({ status: "FAIL", code: "LIFECYCLE_RACE_LEDGER_INVALID" });
  });
  it("không hoàn tất nếu handler xử lý không phải staff của run", async () => {
    const { ctx, writes } = lifecycleBoundary("wrong-handler");
    expect(await runLifecycleConcurrency(ctx)).toMatchObject({ status: "FAIL", code: "LIFECYCLE_RACE_HANDLER_INVALID" });
    expect(writes.some(write => write.target === "COMPLETED")).toBe(false);
  });
  it("settle cả hai outcome mơ hồ trước reject, không cleanup hoặc logout", async () => {
    const { ctx, entries, writes, logouts, arrivals } = lifecycleBoundary("ambiguous");
    await expect(runLifecycleConcurrency(ctx)).rejects.toMatchObject({ code: "MUTATION_OUTCOME_AMBIGUOUS" });
    expect(arrivals).toEqual([2, 0]);
    expect(entries.filter(entry => entry.state === "AMBIGUOUS")).toHaveLength(2);
    expect(writes).toHaveLength(3);
    expect(logouts).toEqual([]);
  });
  it("không nhận ownership hay huỷ marker đã tồn tại", async () => {
    const { ctx, orders, writes } = lifecycleBoundary();
    orders.set("preexisting", { id: "preexisting", note: "[STAGING:run_12345678:confirm-cancel-race]", user_id: "customerB", status: "PENDING" });
    expect(await runLifecycleConcurrency(ctx)).toMatchObject({ status: "FAIL", code: "SMOKE_MARKER_COLLISION" });
    expect(ctx.runState.addMarker).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
    expect(orders.get("preexisting")?.status).toBe("PENDING");
  });
  it("thiếu catalog khả dụng thì PARTIAL không gọi mutation", async () => {
    const { ctx, writes } = lifecycleBoundary();
    ctx.catalog.items = [];
    expect(await runLifecycleConcurrency(ctx)).toMatchObject({ status: "PARTIAL" });
    expect(writes).toEqual([]);
  });
  it("kiểm tra deadline trước mỗi order mới, không bắt đầu race thứ hai khi thiếu thời gian", async () => {
    const { ctx, orders, writes } = lifecycleBoundary();
    ctx.now = () => orders.size ? 3_500_000 : 0;
    expect(await runLifecycleConcurrency(ctx)).toMatchObject({ status: "PARTIAL", code: "LIFECYCLE_RACE_TIME_BUDGET_INSUFFICIENT" });
    expect(orders.size).toBe(1);
    expect(writes.filter(write => write.path === "/api/orders")).toHaveLength(1);
    expect(orders.get("order-1")?.status).toBe("CANCELLED");
  });
  it("catalog đổi thì FAIL, không thay expected để tiếp tục chạy", async () => {
    const { ctx } = lifecycleBoundary();
    ctx.db.catalog = async () => ({ fingerprint: "changed" });
    expect(await runLifecycleConcurrency(ctx)).toMatchObject({ status: "FAIL", code: "CATALOG_CHANGED" });
    expect(ctx.catalog.fingerprint).toBe("catalog");
  });
  it("lỗi cleanup session luôn ưu tiên FAIL hơn thiếu thời gian PARTIAL", async () => {
    const { ctx, orders } = lifecycleBoundary();
    ctx.now = () => orders.size ? 3_500_000 : 0;
    ctx.actorLifecycle.logout = async () => {};
    expect(await runLifecycleConcurrency(ctx)).toMatchObject({ status: "FAIL", code: "LIFECYCLE_RACE_SESSIONS_CHANGED", recoveryRequired: true });
  });
});

describe("Staging voucher concurrency", () => {
  it.each([null, "voucher-race-a", "voucher-race-b", "pacing-stop", "ambiguous-settle"])("voucher race chỉ nhận ownership sau pacing/absence: %s", async collision => {
    const voucher = { id: "v", qr_token: "00000000-0000-4000-8000-000000000001", voucher_type: "DISCOUNT", status: "ACTIVE",
      discount_type: "FIXED", discount_value: 5_000, min_order_vnd: 0, expires_at: null };
    const state = { user: { id: "u", role: "CUSTOMER", points_balance: 100 }, sessions: [], vouchers: [voucher], ledger: [], grants: [] };
    const orders = new Map<string, Record<string, unknown>>();
    const oldMarker = `[STAGING:run_12345678:${collision}]`;
    if (collision?.startsWith("voucher-race")) orders.set("old", { id: "old", user_id: "u", status: "PENDING", note: oldMarker });
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    let releaseSibling!: () => void;
    const siblingGate = new Promise<void>(resolve => { releaseSibling = resolve; });
    const api = { async request(path: string, options: { method?: string; body?: Record<string, unknown> } = {}) {
      if (path === "/api/orders" && options.method === "POST") {
        const marker = String(options.body?.note);
        if (collision === "ambiguous-settle") {
          arrivals += 1;
          if (marker.endsWith("voucher-race-a]")) throw new AmbiguousMutation("lost-a");
          await siblingGate;
        } else {
        arrivals += 1; if (arrivals === 2) release(); await barrier;
        }
        if (voucher.status === "RESERVED") return { ok: false, status: 422, body: { code: "CONFLICT" } };
        voucher.status = "RESERVED";
        const order = { id: `o-${marker.at(-2)}`, user_id: "u", status: "PENDING", order_type: "PICKUP", note: marker,
          items: (options.body?.items as Array<Record<string, unknown>>).map(item => ({ ...item })), discountVouchers: [{ voucher_id: "v" }] };
        orders.set(order.id, order); return { ok: true, status: 201, body: { data: { id: order.id } } };
      }
      if (path.startsWith("/api/orders/") && options.method === "PATCH") {
        const order = orders.get(path.split("/").at(-1)!)!; order.status = "CANCELLED"; voucher.status = "ACTIVE";
        return { ok: true, status: 200, body: { data: { status: "CANCELLED" } } };
      }
      throw new Error("Unexpected HTTP");
    } };
    const journalEntries: Array<{ state: string; type: string }> = [];
    const journal = createJournal({ rootDir: "D:/journal-double", runId: "run_12345678", now: () => new Date(),
      fs: { mkdirSync() {}, appendFileSync(_path: string, content: string) { journalEntries.push(JSON.parse(content)); } } });
    const addMarker = vi.fn();
    const addVoucher = vi.fn();
    const logout = vi.fn();
    const running = runVoucherConcurrency({ runId: "run_12345678", runDir: "unused", origin: "https://test.invalid",
      catalog: { fingerprint: "catalog", items: [{ id: "latte", category: "latte", is_available: true, matcha_powder_id: "powder",
        sizes: [{ size: "SMALL", base_price_vnd: 10_000 }] }], powders: [{ id: "powder", price_per_gram: 2_000, powderSizeConfigs: [] }],
        liquids: [{ id: "milk", is_default: true, price_per_ml: 10 }], defaults: [{ size: "SMALL", powder_gram: 3, milk_ml: 100 }], addonGroups: [] },
      customerState: { ...state, actor: { id: "u" }, orders: [] }, credential: { phone: "+849", password: "pw", role: "CUSTOMER" },
      journal, runState: { addMarker, addVoucher, addSession() {} }, pacer: { reserve: vi.fn(async () => {
        if (collision === "pacing-stop") throw new PrerequisiteMissing("CONCURRENCY_PACING_BUDGET_INSUFFICIENT");
      }) },
      db: { actorState: vi.fn(async () => structuredClone(state)),
        ordersByMarkers: vi.fn(async (markers: string[]) => structuredClone([...orders.values()].filter(order => markers.includes(String(order.note))))),
        order: vi.fn(async (id: string) => structuredClone(orders.get(id))), vouchers: vi.fn(async () => structuredClone([voucher])),
        activeUses: vi.fn(async () => voucher.status === "RESERVED" ? [{ id: [...orders.values()].find(order => order.status === "PENDING")?.id }] : []),
        catalog: vi.fn(async () => ({ fingerprint: "catalog" })) },
      actorLifecycle: { login: vi.fn(async () => ({ name: "customerB", api, sessionId: "s" })), logout },
    });
    if (collision === "ambiguous-settle") {
      let finished = false;
      void running.finally(() => { finished = true; }).catch(() => {});
      await vi.waitFor(() => expect(arrivals).toBe(2));
      expect(finished).toBe(false);
      releaseSibling();
      await expect(running).rejects.toMatchObject({ code: "MUTATION_OUTCOME_AMBIGUOUS" });
      expect(journalEntries.filter(entry => ["APPLIED", "AMBIGUOUS", "NOT_APPLIED"].includes(entry.state))).toHaveLength(2);
      expect(logout).not.toHaveBeenCalled();
      return;
    }
    const result = await running;
    if (collision) {
      expect(result).toMatchObject(collision === "pacing-stop"
        ? { status: "PARTIAL", code: "CONCURRENCY_PACING_BUDGET_INSUFFICIENT" }
        : { status: "FAIL", code: "CONCURRENCY_MARKER_COLLISION" });
      expect(arrivals).toBe(0);
      expect(addMarker).not.toHaveBeenCalled();
      expect(addVoucher).not.toHaveBeenCalled();
      if (collision !== "pacing-stop") expect(orders.get("old")?.status).toBe("PENDING");
      return;
    }
    expect(result).toMatchObject({ status: "PASS", summary: { contenders: 2, winners: 1 } });
    expect(arrivals).toBe(2);
    expect(voucher.status).toBe("ACTIVE");
    expect([...orders.values()]).toHaveLength(1);
    expect([...orders.values()][0].status).toBe("CANCELLED");
  });
});

function exchangeBoundary({ mode = "normal", maxPerUser = 1, balance = 100 }:
  { mode?: "normal" | "ambiguous" | "limit-422"; maxPerUser?: number; balance?: number } = {}) {
  const pkg = { id: "20000000-0000-4000-8000-000000000001", points_cost: 10, max_per_user: maxPerUser, ends_at: null };
  const state = { user: { id: "u", role: "CUSTOMER", points_balance: balance },
    sessions: [{ id: "old" }], vouchers: [] as Array<Record<string, unknown>>,
    ledger: [] as Array<Record<string, unknown>>, grants: [] as Array<Record<string, unknown>> };
  let calls = 0;
  let arrivals = 0;
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  let releaseSibling!: () => void;
  const siblingGate = new Promise<void>(resolve => { releaseSibling = resolve; });
  const entries: Array<{ state: string }> = [];
  const logout = vi.fn(async () => { state.sessions = [{ id: "old" }]; });
  const api = { async request() {
    const index = calls++;
    arrivals += 1;
    if (mode === "ambiguous") {
      if (index === 0) throw new AmbiguousMutation("lost-exchange");
      await siblingGate;
    } else {
      if (arrivals === 2) release();
      await barrier;
    }
    if (state.vouchers.length) return mode === "limit-422"
      ? { ok: false, status: 422, body: { code: "VOUCHER_LIMIT_REACHED" } }
      : { ok: false, status: 409, body: { code: "CONFLICT" } };
    const voucher = { id: "v", qr_token: "token", package_id: pkg.id, voucher_type: "DISCOUNT", status: "ACTIVE" };
    state.vouchers.push(voucher);
    state.ledger.push({ id: "log", user_id: "u", voucher_id: "v", order_id: null, reversed_log_id: null,
      reason: "voucher_purchase", delta: -10 });
    state.user.points_balance = 90;
    return { ok: true, status: 201, body: { data: { qr_token: "token" } } };
  } };
  const journal = createJournal({ rootDir: "D:/journal-double", runId: "run_12345678", now: () => new Date(),
    fs: { mkdirSync() {}, appendFileSync(_path: string, content: string) { entries.push(JSON.parse(content)); } } });
  const addVoucher = vi.fn();
  const ctx = { runId: "run_12345678", runDir: "unused", origin: "https://test.invalid", now: () => 0,
    customerState: structuredClone(state), credential: { phone: "+849", password: "pw", role: "CUSTOMER" },
    plan: { internal: { coverage: { selected: [{ type: "DISCOUNT", source: "exchange", package: pkg }] } } },
    catalog: { fingerprint: "catalog" }, journal, runState: { addSession() {}, addVoucher },
    actorLifecycle: { async login() { state.sessions.push({ id: "run" }); return { name: "customerB", api, sessionId: "run" }; }, logout },
    db: { async actorState() { return structuredClone(state); }, async catalog() { return { fingerprint: "catalog" }; } },
  };
  return { ctx, state, entries, logout, addVoucher, getArrivals: () => arrivals, getCalls: () => calls, releaseSibling };
}

describe("Staging exchange concurrency", () => {
  it("chấp nhận loser 422 VOUCHER_LIMIT_REACHED sau đúng một winner", async () => {
    const { ctx, state } = exchangeBoundary({ mode: "limit-422" });
    await expect(runExchangeConcurrency(ctx)).resolves.toMatchObject({ status: "PASS" });
    expect(state.vouchers).toHaveLength(1);
    expect(state.ledger).toHaveLength(1);
  });
  it("chỉ phát hành một voucher và một ledger khi hai request tranh cùng quota", async () => {
    const { ctx, state, addVoucher, logout } = exchangeBoundary();
    expect(await runExchangeConcurrency(ctx)).toMatchObject({ status: "PASS",
      summary: { contenders: 2, vouchersIssued: 1, pointsSpent: 10 } });
    expect(state.user.points_balance).toBe(90);
    expect(state.vouchers).toHaveLength(1);
    expect(state.ledger).toHaveLength(1);
    expect(addVoucher).toHaveBeenCalledWith("v");
    expect(logout).toHaveBeenCalledOnce();
  });

  it("settle request exchange còn lại trước khi ném ambiguity và không logout", async () => {
    const { ctx, entries, logout, addVoucher, getArrivals, releaseSibling } = exchangeBoundary({ mode: "ambiguous" });
    const running = runExchangeConcurrency(ctx);
    let finished = false;
    void running.finally(() => { finished = true; }).catch(() => {});
    await vi.waitFor(() => expect(getArrivals()).toBe(2));
    expect(finished).toBe(false);
    releaseSibling();
    await expect(running).rejects.toMatchObject({ code: "MUTATION_OUTCOME_AMBIGUOUS" });
    expect(entries.filter(entry => ["APPLIED", "AMBIGUOUS", "NOT_APPLIED"].includes(entry.state))).toHaveLength(2);
    expect(logout).not.toHaveBeenCalled();
    expect(addVoucher).not.toHaveBeenCalled();
  });

  it("không dispatch nếu package còn hơn một lượt hoặc cá không đủ cho hai contender", async () => {
    for (const options of [{ maxPerUser: 2 }, { balance: 19 }]) {
      const { ctx, getCalls, logout } = exchangeBoundary(options);
      expect(await runExchangeConcurrency(ctx)).toMatchObject({ status: "PARTIAL",
        code: "EXCHANGE_RACE_SINGLE_SLOT_PACKAGE_UNAVAILABLE" });
      expect(getCalls()).toBe(0);
      expect(logout).not.toHaveBeenCalled();
    }
  });
});
