// @vitest-environment node

import { describe, expect, it } from "vitest";
import { runFinalItemVoucherLifecycles } from "../../scripts/staging-tests/journeys/final-item-vouchers.mjs";
import { AmbiguousMutation } from "../../scripts/staging-tests/http.mjs";

function boundary(type = "PRODUCT_DISCOUNT", fault = "") {
  const now = Date.parse("2026-09-03T00:00:00Z");
  const voucher = { id: "voucher", qr_token: "token", voucher_type: type, status: "ACTIVE", expires_at: null,
    menu_item_id: type === "ITEM" ? "extra" : "latte", product_discount_mode: "FIXED_AMOUNT",
    eligible_sizes: ["SMALL"], discount_value: 5_000, addon_option_id: "pearl" };
  const states: Record<string, { user: { id: string; role: string; points_balance: number }; vouchers: Array<Record<string, unknown>>;
    ledger: Array<Record<string, unknown>>; sessions: Array<{ id: string }>; grants: unknown[]; orders: unknown[] }> = {};
  for (const [name, role] of [["customerB", "CUSTOMER"], ["admin", "ADMIN"], ["staff", "STAFF"]]) {
    states[name] = { user: { id: name, role, points_balance: 100 }, vouchers: name === "customerB" ? [structuredClone(voucher),
      { id: "other", voucher_type: "FREESHIP", status: "ACTIVE" }] : [], ledger: [{ id: `old-${name}`, delta: 100 }],
      sessions: [{ id: `old-${name}` }], grants: [], orders: [] };
  }
  let order: Record<string, unknown> | null = null;
  const writes: string[] = [];
  const logouts: string[] = [];
  const tokens: string[] = [];
  const api = { async request(path: string, options: { method?: string; body?: Record<string, unknown> } = {}) {
    if (!options.method) {
      const dto = structuredClone(order);
      if (dto) { delete dto.freeship_voucher_id; delete dto.discountVouchers; delete dto.bundleApplications;
        for (const item of dto.items as Array<Record<string, unknown>>) { delete item.product_voucher_id; delete item.item_voucher_id; delete item.addonVouchers; } }
      return { ok: true, status: 200, body: { data: dto } };
    }
    writes.push(path);
    if (options.method === "POST") {
      const payload = options.body as { note: string; items: Array<Record<string, unknown>> };
      const total = type === "PRODUCT_DISCOUNT" ? 12_000 : type === "ITEM" ? 0 : 17_000;
      const subtotal = type === "ITEM" ? 7_000 : type === "ADDON" ? 20_000 : 17_000;
      order = { id: "order", user_id: "customerB", note: payload.note, status: "PENDING", order_type: "PICKUP",
        subtotal_vnd: subtotal, total_voucher_discount_vnd: 0, total_vnd: total, grand_total_vnd: total,
        shipping_fee_vnd: 0, freeship_discount_vnd: 0, freeship_voucher_id: null, discountVouchers: [], bundleApplications: [],
        points_earned: null, payment_confirmed_by: null, payment_confirmed_at: null, handled_by: null,
        items: payload.items.map(item => { const extra = item.menu_item_id === "extra"; const addon = (item.addon_option_ids as unknown[]).length > 0;
          return { ...item, unit_price_vnd: extra ? 7_000 : 17_000, addons_price_vnd: addon ? 3_000 : 0,
            size: extra ? null : "SMALL", selected_powder_id: extra ? null : "powder", selected_milk_type_id: extra ? null : "milk", base_liquid_ml: extra ? null : 100,
            product_voucher_id: item.product_voucher_id ? "voucher" : null, item_voucher_id: item.item_voucher_id ? "voucher" : null,
            addonVouchers: addon ? [{ voucher_id: "voucher", addon_option_id: "pearl" }] : [],
            addons: addon ? [{ addon_option_id: "pearl", quantity: 1, unit_price_vnd: 3_000 }] : [] }; }) };
      states.customerB.vouchers[0].status = fault === "reserved-status" ? "ACTIVE" : "RESERVED";
      if (fault === "money") order.subtotal_vnd = Number(order.subtotal_vnd) + 1_000;
      if (fault === "link") {
        for (const item of order.items as Array<Record<string, unknown>>) {
          item.product_voucher_id = null; item.item_voucher_id = null; item.addonVouchers = [];
        }
      }
      if (fault === "other-wallet") states.customerB.vouchers[1].status = "EXPIRED";
      if (fault === "wrong-user") states.customerB.user.points_balance++;
      return { ok: true, status: 201, body: { data: structuredClone(order) } };
    }
    if (!order) throw new Error("fixture order missing");
    if (path.endsWith("confirm-payment")) {
      if (fault === "ambiguous") throw new AmbiguousMutation("lost");
      if (fault.includes("confirm-rejected")) return { ok: false, status: 409, body: { code: "CONFLICT" } };
      order.status = "ADMIN_CONFIRMED"; order.payment_confirmed_by = "admin"; order.payment_confirmed_at = new Date(now).toISOString();
      Object.assign(states.customerB.vouchers[0], { status: "REDEEMED", used_channel: fault === "metadata" ? "OFFLINE" : "ONLINE",
        redeemed_by: "admin", redeemed_at: new Date(now).toISOString() });
    } else if (options.body?.status === "STAFF_DONE") { order.status = "STAFF_DONE"; order.handled_by = "staff"; }
    else if (options.body?.status === "CANCELLED") {
      if (fault.includes("cancel-rejected")) return { ok: false, status: 409, body: { code: "CONFLICT" } };
      order.status = "CANCELLED"; states.customerB.vouchers[0] = structuredClone(voucher);
    }
    else if (options.body?.status === "COMPLETED" && order.status === "STAFF_DONE") {
      const points = Math.floor(Number(order.total_vnd) / 10_000);
      order.status = "COMPLETED"; order.points_earned = points; states.customerB.user.points_balance += points;
      if (points) states.customerB.ledger.push({ id: "earned", delta: fault === "points" ? points + 1 : points, reason: "order_complete", user_id: "customerB", order_id: "order", performed_by: "staff", voucher_id: null, reversed_log_id: null });
    } else {
      if (fault === "replay") states.customerB.user.points_balance++;
      return { ok: false, status: 400, body: { code: "INVALID_TRANSITION" } };
    }
    return { ok: true, status: 200, body: { data: structuredClone(order) } };
  } };
  const catalog = { fingerprint: "catalog", items: [{ id: "latte", category: "latte", is_available: true, matcha_powder_id: "powder", sizes: [{ size: "SMALL", base_price_vnd: 10_000 }] },
    { id: "extra", category: "extras", is_available: true, unit_price_vnd: 7_000, sizes: [] }], powders: [{ id: "powder", price_per_gram: 2_000, powderSizeConfigs: [] }],
    liquids: [{ id: "milk", is_default: true, price_per_ml: 10 }], defaults: [{ size: "SMALL", powder_gram: 3, milk_ml: 100 }],
    addonGroups: [{ id: "addons", type: "TOGGLE", is_active: true, options: [{ id: "pearl", is_active: true, price_vnd: 3_000, gram_value: null }] }] };
  if (fault === "preexisting") states.customerB.orders = [{ id: "old-order" }];
  const ctx = { runId: "run_12345678", runDir: "unused", origin: "https://test.invalid", now: () => now, catalog,
    actorStates: fault === "missing-actor" ? {} : structuredClone(states), credentials: Object.fromEntries(Object.keys(states).map(name => [name, { phone: name, password: "synthetic" }])),
    pacer: fault === "missing-pacer" ? {} : { async reserve() {} }, journal: { recordIntent() {}, recordOutcome() {} }, runState: { addMarker() {}, addVoucher() {}, addSession() {} },
    actorLifecycle: { async login({ name }: { name: string }) { states[name].sessions.push({ id: `run-${name}` }); tokens.push(name); return { name, sessionId: `run-${name}`, api }; },
      async logout(actor: { name: string }) { logouts.push(actor.name); states[actor.name].sessions = [{ id: `old-${actor.name}` }]; } },
    db: { async actorState(id: string) { return structuredClone(states[id]); }, async catalog() { return { fingerprint: "catalog" }; },
      async order() { return structuredClone(order); }, async ordersByMarkers(markers: string[]) { return order && markers.includes(String(order.note)) ? [structuredClone(order)] : []; },
      async vouchers(ids: string[]) {
        const rows = structuredClone(states.customerB.vouchers.filter(v => ids.includes(String(v.id))));
        if (fault === "postpace" && writes.length === 0 && rows[0]) rows[0].status = "EXPIRED";
        return rows;
      },
      async activeUses() { return order && !["CANCELLED", "COMPLETED"].includes(String(order.status)) ? [{ id: "order" }] : []; } } };
  return { ctx, states, writes, logouts, tokens, getOrder: () => order };
}

describe("Online cuối cho voucher cấp item", () => {
  it("PRODUCT_DISCOUNT redeem ONLINE một lần, cộng đúng 1 điểm và giữ audit", async () => {
    const test = boundary();
    const result = await runFinalItemVoucherLifecycles(test.ctx);
    expect(result.cases).toContainEqual({ id: "online-final-product-discount-redemption", status: "PASS" });
    expect(test.states.customerB.user.points_balance).toBe(101);
    expect(test.getOrder()).toMatchObject({ status: "COMPLETED", total_vnd: 12_000 });
  });

  it.each([
    ["ADDON", "online-final-addon-redemption"],
    ["ITEM", "online-final-item-redemption"],
  ])("%s chạy lifecycle thật trong khi loại thiếu vẫn PARTIAL", async (type, id) => {
    const test = boundary(type);
    const result = await runFinalItemVoucherLifecycles(test.ctx);
    expect(result.cases).toContainEqual({ id, status: "PASS" });
    expect(result.status).toBe("PARTIAL");
  });

  it.each(["money", "link", "reserved-status", "wrong-user", "other-wallet", "metadata", "points", "replay"])(
    "fail closed khi evidence %s sai", async fault => {
      const result = await runFinalItemVoucherLifecycles(boundary("PRODUCT_DISCOUNT", fault).ctx);
      expect(result.status).toBe("FAIL");
    });

  it("khôi phục chính xác khi transition lỗi và vẫn logout đủ session", async () => {
    const test = boundary("PRODUCT_DISCOUNT", "confirm-rejected");
    const result = await runFinalItemVoucherLifecycles(test.ctx);
    expect(result.status).toBe("FAIL");
    expect(test.getOrder()).toMatchObject({ status: "CANCELLED" });
    expect(test.logouts).toEqual(["staff", "admin", "customerB"]);
    expect(test.states.customerB.vouchers[0]).toMatchObject({ status: "ACTIVE" });
    expect(test.states.customerB.vouchers[0]).not.toHaveProperty("used_channel");
  });

  it("cleanup lỗi giữ recoveryRequired và không giả nhận phục hồi", async () => {
    const result = await runFinalItemVoucherLifecycles(boundary("PRODUCT_DISCOUNT", "confirm-rejected+cancel-rejected").ctx);
    expect(result).toMatchObject({ status: "FAIL", recoveryRequired: true });
  });

  it("mutation mơ hồ không retry, không logout session để recovery", async () => {
    const test = boundary("PRODUCT_DISCOUNT", "ambiguous");
    await expect(runFinalItemVoucherLifecycles(test.ctx)).rejects.toMatchObject({ code: "MUTATION_OUTCOME_AMBIGUOUS" });
    expect(test.writes.filter(path => path.includes("confirm-payment"))).toHaveLength(1);
    expect(test.logouts).toEqual([]);
    expect(test.tokens).toEqual(["customerB", "admin", "staff"]);
  });

  it("voucher hết hạn sau pacing trả PARTIAL và không tạo order", async () => {
    const test = boundary("PRODUCT_DISCOUNT", "postpace");
    const result = await runFinalItemVoucherLifecycles(test.ctx);
    expect(result.status).toBe("PARTIAL");
    expect(test.writes).toEqual([]);
  });

  it.each(["missing-actor", "missing-pacer", "preexisting"])("prerequisite %s trả ba case PARTIAL và zero side effect", async fault => {
    const test = boundary("PRODUCT_DISCOUNT", fault);
    const result = await runFinalItemVoucherLifecycles(test.ctx);
    expect(result.status).toBe("PARTIAL");
    expect(result.cases).toHaveLength(3);
    expect(result.cases.every(row => row.status === "PARTIAL")).toBe(true);
    expect(test.writes).toEqual([]);
    expect(test.tokens).toEqual([]);
  });
});
