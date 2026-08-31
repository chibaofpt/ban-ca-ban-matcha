// @vitest-environment node

import { describe, expect, it } from "vitest";
import { runCounterJourneys } from "../../scripts/staging-tests/journeys/counter.mjs";
import { createJournal } from "../../scripts/staging-tests/journal.mjs";
import { AmbiguousMutation } from "../../scripts/staging-tests/http.mjs";

function boundary(fault: "none" | "omit-ledger" | "wrong-reversal" | "lost-create-response" | "voucher-snapshot-changed" | "zero-voucher" | "wrong-api-price" | "wrong-award-balance" | "missing-payment-audit" | "wrong-redemption-audit" = "none") {
  let clock = Date.now();
  const states: Record<string, { user: { id: string; role: string; points_balance: number };
    sessions: Array<{ id: string }>; vouchers: Array<Record<string, unknown>>; ledger: Array<Record<string, unknown>>; grants: unknown[] }> = {};
  for (const [name, role] of [["customerB", "CUSTOMER"], ["staff", "STAFF"], ["admin", "ADMIN"]]) {
    states[name] = { user: { id: name, role, points_balance: 100 }, sessions: [{ id: `old-${name}` }], vouchers: [],
      ledger: [{ id: `old-log-${name}`, reason: "manual_admin_adjustment", delta: 100 }], grants: [] };
  }
  const discountVoucher = { id: "discount-voucher", qr_token: "discount-qr", status: "ACTIVE",
    voucher_type: "DISCOUNT", discount_type: "FIXED", discount_value: fault === "zero-voucher" ? 17_000 : 1_000, min_order_vnd: 0,
    redeemed_at: null as string | null, redeemed_by: null as string | null, used_channel: null as string | null,
    expires_at: null as string | null, package: { ends_at: null as string | null } };
  const redeem = () => Object.assign(discountVoucher, { status: "REDEEMED", redeemed_at: new Date(clock).toISOString(),
    redeemed_by: fault === "wrong-redemption-audit" ? "unrelated" : "staff", used_channel: "OFFLINE" });
  states.customerB.vouchers.push(discountVoucher);
  const orders = new Map<string, Record<string, unknown>>();
  let beforeStaffCreate = async () => {};
  const writes: Array<{ actor: string; path: string; payload?: Record<string, unknown> }> = [];
  const intents: Array<{ type: string; recovery: Record<string, unknown> }> = [];
  const journal = createJournal({ rootDir: "D:/journal-double", runId: "run_12345678", now: () => new Date(),
    fs: { mkdirSync() {}, appendFileSync(_path: string, text: string) {
      const entry = JSON.parse(text); if (entry.state === "INTENT") intents.push(entry);
    } } });
  const award = (order: Record<string, unknown>, performedBy: string | null = null) => {
    if (order.grand_total_vnd === 0) { order.points_earned = 0; return; }
    order.points_earned = 1; states.customerB.user.points_balance += fault === "wrong-award-balance" ? 2 : 1;
    const log = { id: `award-${order.id}`, user_id: "customerB", order_id: order.id, delta: 1, reason: "order_complete", performed_by: performedBy };
    if (fault !== "omit-ledger") { states.customerB.ledger.push(log); (order.pointsLogs as unknown[]).push(log); }
  };
  const paymentDto = (order: Record<string, unknown> | undefined) => order ? {
    ...structuredClone(order), total_vnd: fault === "wrong-api-price" ? 999_000 : order.total_vnd,
    payment_qr_url: order.status === "PENDING"
      ? `https://img.vietqr.io/image/test.jpg?amount=${order.grand_total_vnd}&addInfo=${order.order_code}` : null,
    skipped_vouchers: [],
  } : null;
  const api = (actor: string) => ({ async request(path: string, options: { method?: string; body?: Record<string, unknown> } = {}) {
    if (!options.method || options.method === "GET") {
      if (path === "/api/profile") return { ok: true, status: 200, body: { data: { phone_number: "+84900000000", qr_token: "qr-b", points_balance: states.customerB.user.points_balance } } };
      const order = orders.get(path.split("/").at(-1)!);
      return { ok: true, status: 200, body: { data: paymentDto(order) } };
    }
    writes.push({ actor, path, payload: options.body });
    expect(intents.at(-1)?.recovery.actor).toBe(actor);
    const refusal = (status: number, code: string) => ({ ok: false, status, body: { code } });
    if (path === "/api/staff/orders") {
      if (actor === "staff") await beforeStaffCreate();
      const payload = options.body as { items: Array<Record<string, unknown>>; payment_method: string; phone_number?: string;
        customer_qr_token?: string; discount_voucher_ids?: string[] };
      expect(intents.at(-1)?.recovery.marker).toBe(payload.items[0].note);
      if (actor === "customerB") return refusal(403, "FORBIDDEN");
      if (payload.discount_voucher_ids?.length && payload.customer_qr_token !== "qr-b") return refusal(400, "VALIDATION_ERROR");
      const transfer = payload.payment_method === "BANK_TRANSFER";
      const hasVoucher = Boolean(payload.discount_voucher_ids?.length);
      if (transfer && hasVoucher && fault === "zero-voucher") return { ok: false, status: 422,
        body: { code: "BUSINESS_RULE_VIOLATION", details: { reason: "ZERO_TOTAL_BANK_TRANSFER" } } };
      const voucherDiscount = hasVoucher ? fault === "zero-voucher" ? 17_000 : 1_000 : 0;
      if (hasVoucher) discountVoucher.status = transfer ? "RESERVED" : "REDEEMED";
      if (hasVoucher && !transfer) redeem();
      const order = { id: `order-${orders.size + 1}`, user_id: payload.phone_number ? "customerB" : null, handled_by: "staff",
        order_type: "COUNTER", payment_method: payload.payment_method, status: transfer ? "PENDING" : "COMPLETED", note: null,
        order_code: transfer ? "COUNTER-CODE" : null, auto_cancel_at: transfer ? new Date(Date.now() + 1_200_000).toISOString() : null,
        created_at: new Date(clock).toISOString(), payment_confirmed_at: null, payment_confirmed_by: null,
        subtotal_vnd: 17_000, total_voucher_discount_vnd: voucherDiscount,
        total_vnd: 17_000 - voucherDiscount, grand_total_vnd: 17_000 - voucherDiscount, shipping_fee_vnd: 0, freeship_discount_vnd: 0,
        points_earned: transfer ? null : 0, pointsLogs: [] as unknown[],
        discountVouchers: hasVoucher ? [{ voucher_id: "discount-voucher" }] : [], bundleApplications: [], freeship_voucher_id: null,
        items: payload.items.map(item => ({ ...item, unit_price_vnd: 17_000, addons_price_vnd: 0, base_liquid_ml: 100,
          selected_powder_id: "powder", selected_milk_type_id: "milk", product_voucher_id: null, item_voucher_id: null, addonVouchers: [], addons: [] })) };
      orders.set(order.id, order);
      if (!transfer && payload.phone_number) award(order);
      if (fault === "lost-create-response") throw new AmbiguousMutation();
      return { ok: true, status: 201, body: { data: paymentDto(order) } };
    }
    const order = orders.get(path.split("/").at(-1)!)!;
    if (options.body?.status === "COMPLETED" && order.status === "PENDING") {
      order.status = "COMPLETED"; order.payment_confirmed_by = actor; award(order, actor);
      if (fault !== "missing-payment-audit") order.payment_confirmed_at = new Date(clock).toISOString();
      if ((order.discountVouchers as unknown[]).length) redeem();
    } else if (options.body?.status === "CANCELLED" && actor === "admin" && order.status !== "CANCELLED") {
      if (order.user_id && order.status === "COMPLETED" && order.points_earned !== 0) {
        const log = { id: `reversal-${order.id}`, user_id: "customerB", order_id: order.id, delta: -1,
          reason: "order_complete_reversed", reversed_log_id: fault === "wrong-reversal" ? "unrelated-log" : `award-${order.id}`, performed_by: "admin" };
        states.customerB.user.points_balance -= fault === "wrong-award-balance" ? 2 : 1;
        if (fault !== "omit-ledger") { states.customerB.ledger.push(log); (order.pointsLogs as unknown[]).push(log); }
      }
      order.status = "CANCELLED"; order.points_earned = 0;
      if ((order.discountVouchers as unknown[]).length) {
        discountVoucher.status = discountVoucher.expires_at && Date.parse(discountVoucher.expires_at) <= clock ? "EXPIRED" : "ACTIVE";
        discountVoucher.redeemed_at = null; discountVoucher.redeemed_by = null; discountVoucher.used_channel = null;
        if (fault === "voucher-snapshot-changed") discountVoucher.discount_value += 1_000;
      }
    } else return refusal(400, "INVALID_TRANSITION");
    return { ok: true, status: 200, body: { data: structuredClone(order) } };
  } });
  const actorStates = Object.fromEntries(Object.entries(states).map(([name, state]) => [name, { ...structuredClone(state),
    actor: { id: name, phone_number: name === "customerB" ? "+84900000000" : "+84900000001", qr_token: `qr-${name === "customerB" ? "b" : name}` }, orders: [] }]));
  const ctx = { runId: "run_12345678", runDir: "unused", origin: "https://test.invalid", actorStates, now: () => clock, deadline: clock + 3_600_000,
    credentials: Object.fromEntries(Object.entries(states).map(([name, state]) => [name,
      { phone: actorStates[name].actor.phone_number, password: "synthetic", role: state.user.role }])),
    catalog: { fingerprint: "catalog", items: [{ id: "latte", category: "latte", is_available: true,
      matcha_powder_id: "powder", sizes: [{ size: "SMALL", base_price_vnd: 10_000 }] }],
      powders: [{ id: "powder", price_per_gram: 2_000, powderSizeConfigs: [] }], liquids: [{ id: "milk", is_default: true, price_per_ml: 10 }],
      defaults: [{ size: "SMALL", powder_gram: 3, milk_ml: 100 }], addonGroups: [] },
    journal, runState: { addMarker() {}, addVoucher() {}, addSession() {} }, pacer: { async reserve() {} },
    actorLifecycle: { async login({ name, baselineSessionIds }: { name: string; baselineSessionIds: string[] }) {
      expect(baselineSessionIds).toEqual([`old-${name}`]); states[name].sessions.push({ id: `run-${name}` });
      return { name, api: api(name), sessionId: `run-${name}` };
    }, async logout(actor: { name: string }) { states[actor.name].sessions = [{ id: `old-${actor.name}` }]; } },
    db: { async actorState(id: string) { return structuredClone(states[id]); }, async order(id: string) { return structuredClone(orders.get(id)); },
      async ordersByMarkers(markers: string[]) { return structuredClone([...orders.values()].filter(order =>
        (order.items as Array<Record<string, unknown>>).some(item => markers.includes(String(item.note))))); },
      async vouchers() { return structuredClone([discountVoucher]); },
      async activeUses() { return discountVoucher.status === "RESERVED"
        ? structuredClone([...orders.values()].filter(order => order.status === "PENDING" && (order.discountVouchers as unknown[]).length)) : []; },
      async catalog() { return { fingerprint: "catalog" }; } },
  };
  return { ctx, states, orders, writes, intents, advanceTime: (ms: number) => { clock += ms; },
    setBeforeStaffCreate: (callback: () => Promise<void>) => { beforeStaffCreate = callback; } };
}

describe("Counter staging", () => {
  it("thiếu menu là PARTIAL nhưng session cleanup lỗi phải FAIL", async () => {
    const clean = boundary(); clean.ctx.catalog.items = [];
    expect(await runCounterJourneys(clean.ctx)).toMatchObject({ status: "PARTIAL" });
    expect(clean.writes).toEqual([]);
    const broken = boundary(); broken.ctx.catalog.items = [];
    broken.ctx.actorLifecycle.logout = async () => {};
    expect(await runCounterJourneys(broken.ctx)).toMatchObject({ status: "FAIL", code: "COUNTER_SESSION_CHANGED", recoveryRequired: true });
  });
  it("deadline thiếu sau pacing thì PARTIAL và chỉ giữ đơn cash đã huỷ", async () => {
    const { ctx, orders, setBeforeStaffCreate } = boundary();
    let reservations = 0;
    setBeforeStaffCreate(async () => { if (++reservations === 4) ctx.deadline = ctx.now() + 1_000; });
    expect(await runCounterJourneys(ctx)).toMatchObject({ status: "PARTIAL", code: "COUNTER_TIME_BUDGET_INSUFFICIENT" });
    expect([...orders.values()].map(order => order.status)).toEqual(["CANCELLED", "CANCELLED"]);
  });
  it("voucher RESERVED hết hạn trước confirm thì huỷ an toàn thành EXPIRED và PARTIAL", async () => {
    const { ctx, states, writes, advanceTime } = boundary();
    states.customerB.vouchers[0].expires_at = new Date(ctx.now() + 600_000).toISOString();
    const readOrder = ctx.db.order;
    let advanced = false;
    ctx.db.order = async id => {
      const order = await readOrder(id);
      if (!advanced && order?.status === "PENDING" && (order.discountVouchers as unknown[]).length) { advanced = true; advanceTime(601_000); }
      return order;
    };
    expect(await runCounterJourneys(ctx)).toMatchObject({ status: "PARTIAL", code: "COUNTER_VOUCHER_VALIDITY_INSUFFICIENT", recoveryRequired: false });
    expect(states.customerB.vouchers[0].status).toBe("EXPIRED");
    expect(writes.filter(write => write.path === "/api/staff/orders/order-4" && write.payload?.status === "COMPLETED")).toEqual([]);
  });
  it("voucher ACTIVE nhưng đã hết hạn hiệu lực thì PARTIAL và không gửi voucher", async () => {
    const { ctx, states, writes } = boundary();
    states.customerB.vouchers[0].expires_at = new Date(Date.now() - 1_000).toISOString();
    expect(await runCounterJourneys(ctx)).toMatchObject({ status: "PARTIAL" });
    expect(writes.filter(write => (write.payload?.discount_voucher_ids as string[] | undefined)?.length)).toEqual([]);
  });
  it("phát hiện voucher redeemed bởi actor khác trước khi cancellation xoá audit", async () => {
    const { ctx } = boundary("wrong-redemption-audit");
    expect(await runCounterJourneys(ctx)).toMatchObject({ status: "FAIL", code: "COUNTER_REDEMPTION_AUDIT_INVALID" });
  });
  it("phát hiện thiếu timestamp xác nhận chuyển khoản trước reversal", async () => {
    const { ctx } = boundary("missing-payment-audit");
    expect(await runCounterJourneys(ctx)).toMatchObject({ status: "FAIL", code: "COUNTER_PAYMENT_AUDIT_INVALID" });
  });
  it("không tiêu thụ customer pacer khi staff tạo counter order", async () => {
    const { ctx } = boundary();
    ctx.pacer.reserve = async () => { throw new Error("CUSTOMER_PACER_MUST_NOT_RUN"); };
    expect(await runCounterJourneys(ctx)).toMatchObject({ status: "PASS", summary: { ordersCreated: 6 } });
  });
  it("kiểm tra số dư ngay lúc thưởng thay vì chỉ đối soát tổng cuối hành trình", async () => {
    const { ctx, states } = boundary("wrong-award-balance");
    expect(await runCounterJourneys(ctx)).toMatchObject({ status: "FAIL", code: "COUNTER_AWARD_BALANCE_INVALID" });
    expect(states.customerB.user.points_balance).toBe(100);
  });
  it("báo sai giá response dù database lưu giá đúng và vẫn huỷ đơn của run", async () => {
    const { ctx, orders, states } = boundary("wrong-api-price");
    expect(await runCounterJourneys(ctx)).toMatchObject({ status: "FAIL", code: "COUNTER_API_TOTAL_INVALID_TOTAL_VND" });
    expect([...orders.values()].map(order => order.status)).toEqual(["CANCELLED"]);
    expect(states.customerB.user.points_balance).toBe(100);
  });
  it("đơn voucher 0đ dùng CASH; thiếu cấu hình chuyển khoản phải PARTIAL trước khi POST", async () => {
    const { ctx, writes, states } = boundary("zero-voucher");
    const result = await runCounterJourneys(ctx);
    expect(result).toMatchObject({ status: "PARTIAL", summary: { ordersCreated: 5 } });
    expect(result.gaps).toContainEqual({ id: "counter-voucher-transfer-reversal", status: "PARTIAL",
      code: "COUNTER_POSITIVE_TRANSFER_TOTAL_UNAVAILABLE" });
    expect(writes.filter(write => write.payload?.payment_method === "BANK_TRANSFER"
      && (write.payload?.discount_voucher_ids as string[]).length)).toEqual([]);
    expect(states.customerB.vouchers[0].status).toBe("ACTIVE");
  });
  it("không coi ACTIVE là hoàn voucher đúng khi giá trị voucher bị sửa", async () => {
    const { ctx } = boundary("voucher-snapshot-changed");
    expect(await runCounterJourneys(ctx)).toMatchObject({ status: "FAIL", code: "COUNTER_VOUCHER_SNAPSHOT_CHANGED" });
  });
  it("đối soát đơn đã commit khi mất response, đọc lại API và không POST lặp", async () => {
    const { ctx, writes, intents } = boundary("lost-create-response");
    expect(await runCounterJourneys(ctx)).toMatchObject({ status: "PASS", summary: { ordersCreated: 6 } });
    const creates = writes.filter(write => write.path === "/api/staff/orders");
    const markers = creates.map(write => (write.payload?.items as Array<{ note: string }>)[0].note);
    expect(new Set(markers).size).toBe(creates.length);
    expect(intents.filter(entry => entry.type === "create" && entry.recovery.actor === "staff")
      .map(entry => entry.recovery.userId)).toEqual(["customerB", "customerB", "customerB", "customerB", "customerB", "customerB", "customerB", null]);
  });
  it("dừng trước mutation và không huỷ đơn có sẵn trùng marker", async () => {
    const { ctx, orders, writes } = boundary();
    const old = { id: "preexisting", status: "PENDING", order_type: "COUNTER", user_id: "customerB",
      items: [{ note: "[STAGING:run_12345678:counter-role-denied]" }], discountVouchers: [] };
    orders.set(old.id, structuredClone(old));
    const result = await runCounterJourneys(ctx);
    expect({ result, old: orders.get(old.id), writes }).toMatchObject({
      result: { status: "FAIL", code: "COUNTER_PREEXISTING_MARKER" }, old, writes: [],
    });
  });
  it("từ chối reversal trỏ sai ledger gốc dù delta và số dư đều khớp", async () => {
    const { ctx } = boundary("wrong-reversal");
    expect(await runCounterJourneys(ctx)).toMatchObject({ status: "FAIL", code: "COUNTER_REVERSAL_LEDGER_INVALID" });
  });
  it("không PASS khi số dư về đúng nhưng cả ledger thưởng và reversal bị thiếu", async () => {
    const { ctx, states } = boundary("omit-ledger");
    expect(await runCounterJourneys(ctx)).toMatchObject({ status: "FAIL", code: "COUNTER_AWARD_LEDGER_INVALID" });
    expect(states.customerB.user.points_balance).toBe(100);
  });
  it("báo PARTIAL khi chưa đủ tài khoản và không tạo đơn", async () => {
    expect(await runCounterJourneys({ actorStates: {}, credentials: {} }))
      .toMatchObject({ status: "PARTIAL", code: "COUNTER_ACTOR_UNAVAILABLE" });
  });
  it("CASH và chuyển khoản cộng rồi đảo điểm, khách vãng lai không có points", async () => {
    const { ctx, states, orders } = boundary();
    const result = await runCounterJourneys(ctx);
    expect(result, JSON.stringify(result)).toMatchObject({ status: "PASS", summary: { ordersCreated: 6, netPoints: 0 } });
    expect(result.cases).toEqual(expect.arrayContaining([
      { id: "counter-voucher-missing-customer-qr", status: "PASS" },
      { id: "counter-voucher-mismatched-customer-qr", status: "PASS" },
      { id: "counter-voucher-cash-completes", status: "PASS" },
      { id: "counter-voucher-admin-reversal", status: "PASS" },
      { id: "counter-voucher-reuse-pending", status: "PASS" },
      { id: "counter-voucher-transfer-completes", status: "PASS" },
      { id: "counter-voucher-transfer-reversal", status: "PASS" },
      { id: "counter-voucher-second-reuse-pending", status: "PASS" },
      { id: "counter-voucher-reuse-cancel", status: "PASS" },
    ]));
    expect(states.customerB.user.points_balance).toBe(100);
    expect(states.customerB.ledger.map(log => log.delta)).toEqual([100, 1, -1, 1, -1, 1, -1, 1, -1]);
    expect([...orders.values()].map(order => order.status)).toEqual([
      "CANCELLED", "CANCELLED", "CANCELLED", "CANCELLED", "CANCELLED", "CANCELLED",
    ]);
    expect([...orders.values()].at(-1)).toMatchObject({ user_id: null, points_earned: 0, pointsLogs: [] });
  });
});
