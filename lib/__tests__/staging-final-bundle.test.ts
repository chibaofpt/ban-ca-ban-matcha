// @vitest-environment node

import { describe, expect, it } from "vitest";
import { AmbiguousMutation } from "../../scripts/staging-tests/http.mjs";
import { runFinalBundleLifecycle } from "../../scripts/staging-tests/journeys/final-bundle.mjs";

type Row = Record<string, unknown>;
const IDS = { customerB: "customerB", admin: "admin", staff: "staff", voucher: "voucher", item: "latte", powder: "powder", milk: "milk" };

function boundary(fault = "") {
  const now = Date.parse("2026-09-03T00:00:00Z");
  const rule = fault === "config" ? null : { buy_quantity: 1, reward_quantity: 1, reward_kind: "PRODUCT",
    reward_mode: "SAME_CONFIG", max_applications_order: 1, max_reward_units_order: 1,
    productScopes: [{ role: "QUALIFIER", menu_item_id: IDS.item, sizes: [{ size: "SMALL" }] }] };
  const originalVoucher: Row = { id: IDS.voucher, qr_token: "bundle-token", user_id: IDS.customerB, voucher_type: "BUNDLE",
    status: "ACTIVE", expires_at: null, package: { ends_at: null, min_order_vnd: 0, bundleRule: rule } };
  const states: Record<string, { user: Row & { points_balance: number }; vouchers: Row[]; ledger: Row[]; sessions: Row[]; grants: Row[]; orders: Row[] }> = {};
  for (const [name, role] of [["customerB", "CUSTOMER"], ["admin", "ADMIN"], ["staff", "STAFF"]]) states[name] = {
    user: { id: IDS[name as keyof typeof IDS], role, points_balance: 100 },
    vouchers: name === "customerB" && fault !== "voucher" ? [structuredClone(originalVoucher), { id: "other", voucher_type: "ITEM", status: "ACTIVE" }] : [],
    ledger: [{ id: `old-${name}`, delta: 100 }], sessions: [{ id: `old-${name}` }], grants: [{ id: `grant-${name}` }], orders: [],
  };
  const orders = new Map<string, Row>();
  const writes: string[] = [];
  const logouts: string[] = [];
  let uuidSequence = 0;
  const voucher = () => states.customerB.vouchers.find(row => row.id === IDS.voucher)!;
  const api = { async request(path: string, options: { method?: string; body?: Row } = {}) {
    if (!options.method) {
      const dto = structuredClone(orders.get(path.split("/").at(-1)!));
      if (fault === "public-dto" && dto) dto.total_vnd = Number(dto.total_vnd) + 1_000;
      return { ok: true, status: 200, body: { data: dto } };
    }
    writes.push(path);
    if (path === "/api/orders") {
      const payload = options.body!;
      const inputs = payload.items as Row[];
      const items = inputs.map((input, index) => ({ id: `line-${index}`, menu_item_id: IDS.item, size: "SMALL", quantity: 1,
        unit_price_vnd: 17_000, addons_price_vnd: 0, total_discount_vnd: index === 1 ? 17_000 : 0,
        product_voucher_discount_vnd: 0, product_voucher_id: null, item_voucher_id: null, sweetness: "FULL", ice_option: "NORMAL",
        coldwhisk: false, note: input.note, selected_powder_id: IDS.powder, selected_milk_type_id: IDS.milk,
        base_liquid_ml: 100, addons: [], addonVouchers: [] }));
      const order: Row = { id: "order", user_id: IDS.customerB, status: "PENDING", order_type: "PICKUP", note: payload.note,
        subtotal_vnd: 34_000, total_voucher_discount_vnd: 0, total_vnd: 17_000, shipping_fee_vnd: 0,
        freeship_discount_vnd: 0, grand_total_vnd: 17_000, points_earned: null, payment_method: "BANK_TRANSFER",
        payment_confirmed_by: null, payment_confirmed_at: null, handled_by: null, items, discountVouchers: [], freeship_voucher_id: null,
        bundleApplications: [{ id: "application", voucher_id: IDS.voucher, status: "RESERVED", application_count: 1,
          qualifiers: [{ order_item_id: "line-0", quantity: 1 }], rewards: [{ order_item_id: "line-1", order_item_addon_id: null, quantity: 1, discount_vnd: 17_000 }] }] };
      if (fault === "money") order.total_vnd = 18_000;
      if (fault === "link") (order.bundleApplications as Row[])[0].voucher_id = "wrong";
      orders.set("order", order);
      voucher().status = fault === "reserved-status" ? "ACTIVE" : "RESERVED";
      if (fault === "wrong-user") states.customerB.user.points_balance = 101;
      if (fault === "other-wallet") states.customerB.vouchers[1].status = "EXPIRED";
      return { ok: true, status: 201, body: { data: structuredClone(order), skipped_vouchers: [] } };
    }
    const order = orders.get("order")!;
    if (path.includes("confirm-payment")) {
      if (fault === "ambiguous-confirm") throw new AmbiguousMutation("lost");
      if (fault.includes("confirm-rejected")) return { ok: false, status: 409, body: { code: "CONFLICT" } };
      order.status = "ADMIN_CONFIRMED"; order.payment_confirmed_by = IDS.admin; order.payment_confirmed_at = new Date(now).toISOString();
      if (fault === "payment-actor") order.payment_confirmed_by = IDS.staff;
      if (fault === "payment-time") order.payment_confirmed_at = "2020-01-01T00:00:00.000Z";
      if (fault === "payment-method") order.payment_method = "CASH";
      (order.bundleApplications as Row[])[0].status = "REDEEMED";
      Object.assign(voucher(), { status: "REDEEMED", used_channel: fault === "metadata" ? "OFFLINE" : "ONLINE",
        redeemed_by: IDS.admin, redeemed_at: new Date(now).toISOString() });
      if (fault === "selected-business") (voucher().package as Row).min_order_vnd = 1_000;
    } else if (options.body?.status === "STAFF_DONE") {
      if (fault === "ambiguous-staff") throw new AmbiguousMutation("lost");
      order.status = "STAFF_DONE"; order.handled_by = IDS.staff;
      if (fault === "transition-money") order.total_vnd = 20_000;
      if (fault === "transition-config") (order.items as Row[])[0].selected_milk_type_id = "wrong";
      if (fault === "nonbundle-link") order.discountVouchers = [{ voucher_id: "other" }];
      if (fault === "application-count") (order.bundleApplications as Row[])[0].application_count = 2;
    } else if (options.body?.status === "CANCELLED") {
      if (fault.includes("cancel-rejected")) return { ok: false, status: 409, body: { code: "CONFLICT" } };
      order.status = "CANCELLED"; (order.bundleApplications as Row[])[0].status = "CANCELLED";
      if (fault.includes("stale-app")) (order.bundleApplications as Row[])[0].status = "RESERVED";
      if (fault.includes("stale-marker")) order.note = "wrong-marker";
      states.customerB.vouchers[0] = structuredClone(originalVoucher);
    } else if (options.body?.status === "COMPLETED" && order.status === "STAFF_DONE") {
      const earned = fault === "completed-money-points" ? 2 : 1;
      order.status = "COMPLETED"; order.points_earned = earned; states.customerB.user.points_balance = 100 + earned;
      if (fault === "points-earned") order.points_earned = 2;
      if (fault === "completed-money-points") order.total_vnd = 20_000;
      states.customerB.ledger.push({ id: "earned", delta: fault === "ledger" ? 2 : earned, reason: "order_complete",
        order_id: "order", user_id: fault === "ledger-user" ? IDS.admin : IDS.customerB, performed_by: IDS.staff,
        voucher_id: fault === "ledger-voucher" ? IDS.voucher : null, reversed_log_id: fault === "ledger-reversed" ? "old" : null });
    } else {
      if (fault === "replay") states.customerB.user.points_balance++;
      return { ok: false, status: 400, body: { code: "INVALID_TRANSITION" } };
    }
    return { ok: true, status: 200, body: { data: structuredClone(order) } };
  } };
  const catalog = { fingerprint: "catalog", items: [{ id: IDS.item, category: "latte", is_available: true,
    matcha_powder_id: IDS.powder, sizes: [{ size: "SMALL", base_price_vnd: 10_000 }] }],
    powders: [{ id: IDS.powder, price_per_gram: 2_000, powderSizeConfigs: [] }],
    liquids: [{ id: IDS.milk, is_default: true, price_per_ml: 10 }], defaults: [{ size: "SMALL", powder_gram: 3, milk_ml: 100 }], addonGroups: [] };
  const ctx = { runId: "run_12345678", runDir: "unused", origin: "https://test.invalid", now: () => now,
    uuid: () => `00000000-0000-4000-8000-${String(++uuidSequence).padStart(12, "0")}`, catalog,
    actorStates: fault === "actor" ? {} : structuredClone(states),
    credentials: Object.fromEntries(Object.keys(states).map(name => [name, { phone: name, password: "synthetic" }])),
    pacer: { async reserve() { if (fault === "pacing") Object.assign(new Error("quota"), { status: "PARTIAL", code: "FINAL_BUNDLE_QUOTA" }); } },
    journal: { recordIntent() {}, recordOutcome() {} }, runState: { addMarker() {}, addVoucher() {}, addSession() {} },
    actorLifecycle: { async login({ name }: { name: string }) { states[name].sessions.push({ id: `run-${name}` }); return { name, sessionId: `run-${name}`, api }; },
      async logout(actor: { name: string }) { logouts.push(actor.name); states[actor.name].sessions = [{ id: `old-${actor.name}` }]; } },
    db: { async actorState(id: string) { return structuredClone(states[id]); }, async catalog() { return { fingerprint: "catalog" }; },
      async order(id: string) { return structuredClone(orders.get(id)); },
      async ordersByMarkers(markers: string[]) {
        if (fault.includes("audit-missing") && logouts.length) return [];
        return structuredClone([...orders.values()].filter(row => markers.includes(String(row.note))));
      },
      async vouchers(ids: string[]) { return structuredClone(states.customerB.vouchers.filter(row => ids.includes(String(row.id)))); },
      async activeUses() { const row = orders.get("order");
        if (fault.includes("stale-use") && row?.status === "CANCELLED") return [{ id: "order" }];
        return row && !["CANCELLED", "COMPLETED"].includes(String(row.status)) ? [{ id: "order" }] : []; } } };
  if (fault === "pacing") ctx.pacer.reserve = async () => { throw Object.assign(new Error("quota"), { status: "PARTIAL", code: "FINAL_BUNDLE_QUOTA" }); };
  return { ctx, states, orders, writes, logouts };
}

describe("Online cuối cho BUNDLE PRODUCT/SAME_CONFIG", () => {
  it("redeem đúng allocation, metadata, điểm và replay bất biến", async () => {
    const test = boundary();
    await expect(runFinalBundleLifecycle(test.ctx)).resolves.toMatchObject({ status: "PASS",
      cases: [{ id: "online-final-bundle-redemption", status: "PASS" }] });
    expect(test.orders.get("order")).toMatchObject({ status: "COMPLETED", points_earned: 1,
      bundleApplications: [{ status: "REDEEMED", voucher_id: IDS.voucher }] });
    expect(test.writes.filter(path => path === "/api/orders")).toHaveLength(1);
  });

  it.each(["actor", "voucher", "config", "pacing"])("thiếu %s trả PARTIAL và không tạo order", async fault => {
    const test = boundary(fault);
    const result = await runFinalBundleLifecycle(test.ctx);
    expect(result.status).toBe("PARTIAL");
    expect(test.writes).toEqual([]);
  });

  it.each(["money", "link", "reserved-status", "wrong-user", "metadata", "ledger", "other-wallet", "replay",
    "transition-money", "transition-config", "nonbundle-link", "public-dto", "payment-actor", "payment-time", "payment-method",
    "ledger-user", "ledger-voucher", "ledger-reversed", "selected-business", "completed-money-points",
    "application-count", "points-earned"])(
    "fail closed khi evidence %s sai", async fault => {
      expect((await runFinalBundleLifecycle(boundary(fault).ctx)).status).toBe("FAIL");
    });

  it("transition lỗi được cancel chính xác và logout đủ", async () => {
    const test = boundary("confirm-rejected");
    const result = await runFinalBundleLifecycle(test.ctx);
    expect(result.status).toBe("FAIL");
    expect(test.orders.get("order")).toMatchObject({ status: "CANCELLED", bundleApplications: [{ status: "CANCELLED" }] });
    expect(test.logouts).toEqual(["staff", "admin", "customerB"]);
    expect(test.states.customerB.vouchers[0]).toMatchObject({ status: "ACTIVE" });
  });

  it("cleanup bị từ chối chỉ thử một lần và báo recoveryRequired", async () => {
    const test = boundary("confirm-rejected+cancel-rejected");
    expect(await runFinalBundleLifecycle(test.ctx)).toMatchObject({ status: "FAIL", recoveryRequired: true });
    expect(test.writes.filter(path => path === "/api/staff/orders/order")).toHaveLength(1);
  });

  it.each(["stale-app", "stale-use", "stale-marker", "audit-missing"])("cleanup %s báo FAIL recoveryRequired", async fault => {
    const test = boundary(`confirm-rejected+${fault}`);
    expect(await runFinalBundleLifecycle(test.ctx)).toMatchObject({ status: "FAIL", recoveryRequired: true });
  });

  it.each(["ambiguous-confirm", "ambiguous-staff"])("%s không retry và giữ session recovery", async fault => {
    const test = boundary(fault);
    await expect(runFinalBundleLifecycle(test.ctx)).rejects.toMatchObject({ code: "MUTATION_OUTCOME_AMBIGUOUS" });
    expect(test.writes.filter(path => fault.endsWith("confirm") ? path.includes("confirm-payment") : path === "/api/staff/orders/order")).toHaveLength(1);
    expect(test.logouts).toEqual([]);
    expect(test.states.customerB.sessions).toHaveLength(2);
  });
});
