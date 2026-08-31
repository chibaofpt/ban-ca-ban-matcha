// @vitest-environment node

import { describe, expect, it } from "vitest";
import { runOnlineLifecycle } from "../../scripts/staging-tests/journeys/lifecycle.mjs";
import { AmbiguousMutation } from "../../scripts/staging-tests/http.mjs";
import { createJournal } from "../../scripts/staging-tests/journal.mjs";
import { runPaymentExpiry } from "../../scripts/staging-tests/journeys/expiry.mjs";

function boundary(mode: "normal" | "early-points" | "double-points" | "replay-write" | "ambiguous-confirm" | "bad-snapshot" | "bad-profile" | "missing-audit" | "wrong-handler" | "expiry" | "expiry-lost" | "expiry-already-cancelled" | "expiry-cron-race" = "normal") {
  let clock = Date.parse("2026-08-30T00:00:00Z");
  const waits: number[] = [];
  const states: Record<string, { user: { id: string; role: string; points_balance: number }; sessions: Array<{ id: string }>;
    vouchers: unknown[]; ledger: Array<Record<string, unknown>>; grants: unknown[] }> = {};
  for (const [name, role] of [["customerB", "CUSTOMER"], ["staff", "STAFF"], ["admin", "ADMIN"]]) {
    states[name] = { user: { id: name, role, points_balance: 100 }, sessions: [{ id: `baseline-${name}` }],
      vouchers: [], ledger: [{ id: `old-${name}`, delta: 100, reason: "manual_admin_adjustment" }], grants: [] };
  }
  let order: Record<string, unknown> | null = null;
  const writes: Array<{ actor: string; path: string; target?: unknown }> = [];
  const intents: Array<Record<string, unknown>> = [];
  const journalEntries: Array<{ state: string; type: string; recovery?: Record<string, unknown> }> = [];
  const logins: string[] = [];
  const logouts: string[] = [];
  const api = (actor: string) => ({ async request(path: string, options: { method?: string; body?: Record<string, unknown> } = {}) {
    if (!options.method || options.method === "GET") {
      if (path === "/api/profile") return { ok: true, status: 200, body: { data: { points_balance: mode === "bad-profile" ? 999 : states.customerB.user.points_balance } } };
      return { ok: true, status: 200, body: { data: structuredClone(order) } };
    }
    writes.push({ actor, path, target: options.body?.status });
    expect(intents.at(-1)?.actor).toBe(actor);
    if (path === "/api/orders") {
      const payload = options.body as { note: string; items: Array<Record<string, unknown>> };
      order = { id: "order", user_id: "customerB", status: "PENDING", order_type: "PICKUP", note: payload.note,
        created_at: new Date(clock).toISOString(), auto_cancel_at: new Date(clock + 1_200_000).toISOString(),
        subtotal_vnd: 17_000, total_voucher_discount_vnd: 0, total_vnd: 17_000, grand_total_vnd: 17_000,
        shipping_fee_vnd: 0, freeship_discount_vnd: 0, discountVouchers: [], bundleApplications: [], freeship_voucher_id: null,
        points_earned: null, handled_by: null, payment_confirmed_by: null,
        items: payload.items.map(item => ({ ...item, unit_price_vnd: 17_000, addons_price_vnd: 0,
          product_voucher_id: null, item_voucher_id: null, addonVouchers: [], addons: [],
          selected_powder_id: "powder", selected_milk_type_id: "milk", base_liquid_ml: 100 })) };
      return { ok: true, status: 201, body: { data: structuredClone(order) } };
    }
    const refusal = (status: number, code: string) => ({ ok: false, status, body: { code } });
    if (path.includes("confirm-payment")) {
      if (actor !== "admin") return refusal(401, "UNAUTHORIZED");
      if (mode === "expiry-cron-race" && order) order.status = "CANCELLED";
      if (order?.status !== "PENDING") return refusal(422, "INVALID_STATUS");
      if (mode === "expiry" || mode === "expiry-lost") {
        expect(clock).toBeGreaterThanOrEqual(Date.parse(String(order.auto_cancel_at)));
        order.status = "CANCELLED";
        if (mode === "expiry-lost") throw new AmbiguousMutation();
        return refusal(422, "ORDER_EXPIRED");
      }
      if (mode === "ambiguous-confirm") throw new AmbiguousMutation("lost");
      order.status = "ADMIN_CONFIRMED"; order.payment_confirmed_by = "admin";
      if (mode === "early-points") states.customerB.user.points_balance = 101;
    } else if (path === "/api/orders/order") {
      if (actor !== "customerB") return refusal(403, "FORBIDDEN");
      return refusal(422, "INVALID_STATUS");
    } else {
      if (actor === "customerB") return refusal(401, "UNAUTHORIZED");
      const target = options.body?.status;
      if (target === "ADMIN_CONFIRMED") return refusal(400, "INVALID_TRANSITION");
      if (target === "STAFF_DONE" && order?.status === "ADMIN_CONFIRMED") {
        order.status = "STAFF_DONE"; order.handled_by = "staff";
        if (mode === "wrong-handler") order.handled_by = "someone-else";
        if (mode === "bad-snapshot") order.total_vnd = 18_000;
      } else if (target === "COMPLETED" && order?.status === "STAFF_DONE") {
        order.status = "COMPLETED"; order.points_earned = 1;
        states.customerB.user.points_balance = 101;
        states.customerB.ledger.push({ id: "earned", order_id: "order", user_id: "customerB", reason: "order_complete", delta: 1, performed_by: "staff" });
        if (mode === "double-points") states.customerB.ledger.push({ id: "duplicate", order_id: "order", reason: "order_complete", delta: 1 });
      } else if (target === "CANCELLED" && actor === "admin" && order && order.status !== "COMPLETED") order.status = "CANCELLED";
      else {
        if (mode === "replay-write" && target === "COMPLETED") states.customerB.user.points_balance += 1;
        return refusal(400, "INVALID_TRANSITION");
      }
    }
    return { ok: true, status: 200, body: { data: structuredClone(order) } };
  } });
  const ctx = { runId: "run_12345678", runDir: "unused", origin: "https://test.invalid",
    now: () => clock, deadline: clock + 3_600_000,
    async sleep(ms: number) {
      waits.push(ms); clock += ms;
      if (mode === "expiry-already-cancelled" && order && clock >= Date.parse(String(order.auto_cancel_at))) order.status = "CANCELLED";
    },
    actorStates: structuredClone(states),
    credentials: Object.fromEntries(Object.entries(states).map(([name, state]) => [name, { phone: "+84900000000", password: "synthetic", role: state.user.role }])),
    catalog: { fingerprint: "catalog", items: [{ id: "latte", category: "latte", is_available: true,
      matcha_powder_id: "powder", sizes: [{ size: "SMALL", base_price_vnd: 10_000 }] }],
      powders: [{ id: "powder", price_per_gram: 2_000, powderSizeConfigs: [] }],
      liquids: [{ id: "milk", is_default: true, price_per_ml: 10 }],
      defaults: [{ size: "SMALL", powder_gram: 3, milk_ml: 100 }], addonGroups: [] },
    pacer: { async reserve() {} }, runState: { addMarker() {}, addSession() {} },
    journal: createJournal({ rootDir: "D:/journal-boundary", runId: "run_12345678", now: () => new Date("2026-08-30T00:00:00Z"),
      fs: { mkdirSync() {}, appendFileSync(_path: string, content: string) {
        const entry = JSON.parse(content) as { state: string; type: string; recovery?: Record<string, unknown> };
        journalEntries.push(entry); if (entry.state === "INTENT" && entry.recovery) intents.push(entry.recovery);
      } } }),
    actorLifecycle: {
      async login({ name, baselineSessionIds }: { name: string; baselineSessionIds: string[] }) {
        expect(baselineSessionIds).toEqual([`baseline-${name}`]); logins.push(name);
        states[name].sessions.push({ id: `run-${name}` });
        return { name, api: api(name), sessionId: `run-${name}` };
      },
      async logout(actor: { name: string }) { logouts.push(actor.name); states[actor.name].sessions = [{ id: `baseline-${actor.name}` }];
        if (mode === "missing-audit") order = null; },
    },
    db: { async actorState(id: string) { return structuredClone(states[id]); }, async order() { return structuredClone(order); },
      async ordersByMarkers(markers: string[]) { return order && markers.includes(String(order.note)) ? [structuredClone(order)] : []; },
      async catalog() { return { fingerprint: "catalog" }; } },
  };
  return { ctx, states, writes, logins, logouts, journalEntries, waits, getOrder: () => order };
}

describe("Hết hạn thanh toán staging", () => {
  it("chấp nhận cron huỷ giữa DB read và PATCH, không gán mutation huỷ cho confirm", async () => {
    const { ctx, journalEntries } = boundary("expiry-cron-race");
    expect(await runPaymentExpiry(ctx)).toMatchObject({ status: "PASS" });
    expect(journalEntries).toContainEqual(expect.objectContaining({ type: "confirm", state: "NOT_APPLIED" }));
  });
  it("thiếu thời gian chờ và cleanup thì PARTIAL trước đăng nhập hay tạo đơn", async () => {
    const { ctx, writes, logins, waits } = boundary("expiry");
    ctx.deadline = ctx.now() + 1_300_000;
    expect(await runPaymentExpiry(ctx)).toMatchObject({ status: "PARTIAL", code: "EXPIRY_TIME_BUDGET_INSUFFICIENT" });
    expect(writes).toEqual([]); expect(logins).toEqual([]); expect(waits).toEqual([]);
  });
  it("không PASS khi API vẫn xác nhận sau hạn; huỷ đúng đơn và giữ lỗi gốc", async () => {
    const { ctx, getOrder } = boundary();
    expect(await runPaymentExpiry(ctx)).toMatchObject({ status: "FAIL", code: "EXPIRY_CONFIRMATION_NOT_REJECTED" });
    expect(getOrder()?.status).toBe("CANCELLED");
  });
  it("mất response sau huỷ thì đối soát nhưng PARTIAL vì chưa quan sát được contract lỗi", async () => {
    const { ctx, writes, getOrder } = boundary("expiry-lost");
    const result = await runPaymentExpiry(ctx);
    expect(result).toMatchObject({ status: "PARTIAL" });
    expect(result.cases).toContainEqual({ id: "payment-expiry-refusal", status: "PARTIAL", code: "EXPIRY_RESPONSE_NOT_OBSERVED" });
    expect(writes).toHaveLength(2);
    expect(getOrder()?.status).toBe("CANCELLED");
  });
  it("không ghi tiếp hay logout khi kết quả xác nhận còn chưa rõ", async () => {
    const { ctx, writes, logouts } = boundary("ambiguous-confirm");
    await expect(runPaymentExpiry(ctx)).rejects.toMatchObject({ code: "MUTATION_OUTCOME_AMBIGUOUS" });
    expect(writes).toHaveLength(2); expect(logouts).toEqual([]);
  });
  it("chấp nhận từ chối INVALID_STATUS khi hệ thống đã tự huỷ đúng đơn sau hạn", async () => {
    const { ctx, journalEntries, getOrder } = boundary("expiry-already-cancelled");
    expect(await runPaymentExpiry(ctx)).toMatchObject({ status: "PASS" });
    expect(getOrder()?.status).toBe("CANCELLED");
    expect(journalEntries).toContainEqual(expect.objectContaining({ type: "confirm", state: "NOT_APPLIED" }));
  });
  it("chờ deadline thật theo từng đoạn rồi bị từ chối xác nhận, giữ audit và không cộng cá", async () => {
    const { ctx, states, waits, writes, logouts, getOrder, journalEntries } = boundary("expiry");
    const logins = [] as string[];
    const originalLogin = ctx.actorLifecycle.login;
    const originalSleep = ctx.sleep;
    ctx.actorLifecycle.login = async options => { logins.push(options.name); return originalLogin(options); };
    ctx.sleep = async ms => {
      expect(logins).toEqual(["customerB"]);
      return originalSleep(ms);
    };
    expect(await runPaymentExpiry(ctx)).toMatchObject({ status: "PASS", summary: { ordersExpired: 1, pointsAwarded: 0 } });
    expect(waits.reduce((sum, ms) => sum + ms, 0)).toBeGreaterThanOrEqual(1_200_000);
    expect(Math.max(...waits)).toBeLessThanOrEqual(45_000);
    expect(writes.map(write => write.path)).toEqual(["/api/orders", "/api/admin/orders/order/confirm-payment"]);
    expect(journalEntries).toContainEqual(expect.objectContaining({ type: "confirm", state: "APPLIED" }));
    expect(getOrder()).toMatchObject({ status: "CANCELLED", payment_confirmed_by: null });
    expect(states.customerB.user.points_balance).toBe(100);
    expect(states.customerB.ledger).toHaveLength(1);
    expect(logouts.sort()).toEqual(["admin", "customerB"]);
    expect(logins).toEqual(["customerB", "admin"]);
  });
});

describe("Lifecycle staging online không voucher", () => {
  it("báo PARTIAL trước mọi mutation khi thiếu thông tin đăng nhập", async () => {
    const result = await runOnlineLifecycle({ actorStates: {}, credentials: {} });
    expect(result).toMatchObject({ status: "PARTIAL", code: "LIFECYCLE_ACTOR_UNAVAILABLE" });
  });
  it("hoàn thành đơn 17.000 đồng, cộng đúng 1 điểm và giữ nguyên phiên cũ của ba vai trò", async () => {
    const { ctx, states, logins, logouts, journalEntries, getOrder } = boundary();
    expect(await runOnlineLifecycle(ctx)).toMatchObject({ status: "PASS", summary: { pointsAwarded: 1, ordersCompleted: 1 } });
    expect(getOrder()).toMatchObject({ status: "COMPLETED", points_earned: 1, payment_confirmed_by: "admin", handled_by: "staff" });
    expect(states.customerB.user.points_balance).toBe(101);
    expect(states.customerB.ledger).toHaveLength(2);
    expect(logins.sort()).toEqual(["admin", "customerB", "staff"]);
    expect(logouts.sort()).toEqual(["admin", "customerB", "staff"]);
    expect(journalEntries.filter(entry => entry.state === "INTENT").map(entry => entry.type))
      .toEqual(["create", "confirm", "confirm", "status", "cancel", "confirm", "cancel", "status", "status", "status"]);
  });
  it("phát hiện cộng điểm trước COMPLETED và huỷ đúng order đang chạy", async () => {
    const { ctx, getOrder } = boundary("early-points");
    expect(await runOnlineLifecycle(ctx)).toMatchObject({ status: "FAIL", code: "LIFECYCLE_POINTS_BALANCE_INVALID" });
    expect(getOrder()?.status).toBe("CANCELLED");
  });
  it("phát hiện hai ledger cộng điểm dù tổng tiền vẫn đúng", async () => {
    const { ctx } = boundary("double-points");
    expect(await runOnlineLifecycle(ctx)).toMatchObject({ status: "FAIL", code: "LIFECYCLE_POINTS_LEDGER_INVALID" });
  });
  it("phát hiện replay bị từ chối nhưng vẫn cộng thêm điểm", async () => {
    const { ctx } = boundary("replay-write");
    expect(await runOnlineLifecycle(ctx)).toMatchObject({ status: "FAIL", code: "LIFECYCLE_REJECTED_MUTATION_CHANGED_STATE" });
  });
  it("dừng toàn bộ mutation và logout khi confirm không rõ outcome", async () => {
    const { ctx, writes, logouts } = boundary("ambiguous-confirm");
    await expect(runOnlineLifecycle(ctx)).rejects.toMatchObject({ code: "MUTATION_OUTCOME_AMBIGUOUS" });
    expect(writes.at(-1)).toMatchObject({ actor: "admin", target: "ADMIN_CONFIRMED" });
    expect(logouts).toEqual([]);
  });
  it("không cho phép snapshot tiền thay đổi ở STAFF_DONE", async () => {
    const { ctx, getOrder } = boundary("bad-snapshot");
    expect(await runOnlineLifecycle(ctx)).toMatchObject({ status: "FAIL", code: "LIFECYCLE_SNAPSHOT_CHANGED" });
    expect(getOrder()?.status).toBe("CANCELLED");
  });
  it("đối chiếu điểm hiển thị profile với ledger đã hoàn tất", async () => {
    const { ctx } = boundary("bad-profile");
    expect(await runOnlineLifecycle(ctx)).toMatchObject({ status: "FAIL", code: "LIFECYCLE_PUBLIC_POINTS_INVALID" });
  });
  it("không đăng nhập nếu vai trò staff không đúng", async () => {
    const { ctx, logins, writes } = boundary();
    ctx.actorStates.staff.user.role = "CUSTOMER";
    expect(await runOnlineLifecycle(ctx)).toMatchObject({ status: "PARTIAL" });
    expect(logins).toEqual([]); expect(writes).toEqual([]);
  });
  it("không tạo order khi customer không có cấu hình để nhận điểm dương", async () => {
    const { ctx, logins } = boundary();
    ctx.catalog.items[0].sizes[0].base_price_vnd = 0;
    ctx.catalog.powders[0].price_per_gram = 0;
    ctx.catalog.liquids[0].price_per_ml = 0;
    expect(await runOnlineLifecycle(ctx)).toMatchObject({ status: "PARTIAL" });
    expect(logins).toEqual([]);
  });
  it("không báo PASS nếu audit COMPLETED biến mất trước đối soát cuối", async () => {
    const { ctx } = boundary("missing-audit");
    expect(await runOnlineLifecycle(ctx)).toMatchObject({ status: "FAIL", code: "LIFECYCLE_TERMINAL_AUDIT_MISSING" });
  });
  it("đối soát đúng staff nhận xử lý order", async () => {
    const { ctx } = boundary("wrong-handler");
    expect(await runOnlineLifecycle(ctx)).toMatchObject({ status: "FAIL", code: "LIFECYCLE_HANDLER_INVALID" });
  });
});
