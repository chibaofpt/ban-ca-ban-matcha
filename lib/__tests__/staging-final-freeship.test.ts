// @vitest-environment node

import { describe, expect, it } from "vitest";
import { runFinalFreeshipLifecycle } from "../../scripts/staging-tests/journeys/final-freeship.mjs";
import { createJournal } from "../../scripts/staging-tests/journal.mjs";
import { AmbiguousMutation } from "../../scripts/staging-tests/http.mjs";
import { PrerequisiteMissing } from "../../scripts/staging-tests/errors.mjs";

function boundary(mode = "normal") {
  let clock = Date.parse("2026-09-02T00:00:00Z");
  const voucher = { id: "freeship", qr_token: "freeship-token", voucher_type: "FREESHIP", status: "ACTIVE",
    min_order_vnd: mode === "infeasible" ? 400_000 : 40_000, covered_delivery_fee_vnd: 20_000,
    expires_at: null, package: { ends_at: null } };
  const address = { id: "address", distance_km: 3, user_id: "customerB" };
  const states: Record<string, { user: { id: string; role: string; points_balance: number };
    vouchers: Array<Record<string, unknown>>; ledger: Array<Record<string, unknown>>;
    sessions: Array<{ id: string }>; grants: unknown[] }> = {};
  for (const [name, role] of [["customerB", "CUSTOMER"], ["staff", "STAFF"], ["admin", "ADMIN"]]) {
    states[name] = { user: { id: name, role, points_balance: 100 }, vouchers: name === "customerB" ? [structuredClone(voucher)] : [],
      ledger: [{ id: `old-${name}`, delta: 100 }], sessions: [{ id: `old-session-${name}` }], grants: [] };
  }
  let order: Record<string, unknown> | null = null;
  let submitted: Record<string, unknown> | undefined;
  const writes: string[] = [];
  const logins: string[] = [];
  const logouts: string[] = [];
  const paces: number[] = [];
  const intents: Array<Record<string, unknown>> = [];
  const publicOrder = () => {
    const result = structuredClone(order);
    if (result) for (const key of ["user_id", "freeship_voucher_id", "discountVouchers", "bundleApplications"]) delete result[key];
    if (result) for (const item of result.items as Array<Record<string, unknown>>) {
      for (const key of ["product_voucher_id", "item_voucher_id", "addonVouchers"]) delete item[key];
    }
    return result;
  };
  const journal = createJournal({ rootDir: "D:/freeship-journal", runId: "run_12345678", now: () => new Date(clock),
    fs: { mkdirSync() {}, appendFileSync(_path: string, content: string) {
      const entry = JSON.parse(content) as { state: string; recovery?: Record<string, unknown> };
      if (entry.state === "INTENT" && entry.recovery) intents.push(entry.recovery);
    } } });
  const api = (actor: string) => ({ async request(path: string, options: { method?: string; body?: Record<string, unknown> } = {}) {
    if (!options.method) return { ok: true, status: 200, body: { data: path === "/api/profile"
      ? { points_balance: states.customerB.user.points_balance } : publicOrder() } };
    writes.push(path);
    expect(intents.at(-1)?.actor).toBe(actor);
    if (path === "/api/orders") {
      const body = options.body as { note: string; address_id: string; items: Array<Record<string, unknown>> };
      submitted = structuredClone(body);
      order = { id: "order", user_id: "customerB", status: "PENDING", order_type: "DELIVERY", note: body.note,
        address_id: body.address_id, delivery_distance_km: 3, subtotal_vnd: 51_000, total_voucher_discount_vnd: 0,
        total_vnd: 51_000, shipping_fee_vnd: 18_000, freeship_discount_vnd: 18_000, grand_total_vnd: 51_000,
        freeship_voucher_id: "freeship", points_earned: null, payment_confirmed_by: null,
        payment_confirmed_at: null, handled_by: null, discountVouchers: [], bundleApplications: [],
        items: body.items.map(item => ({ ...item, unit_price_vnd: 17_000, addons_price_vnd: 0,
          size: mode === "extras" ? null : item.size,
          selected_powder_id: mode === "extras" ? null : "powder", selected_milk_type_id: mode === "extras" ? null : "milk", base_liquid_ml: mode === "extras" ? null : 100,
          product_voucher_id: null, item_voucher_id: null, product_voucher_discount_vnd: 0,
          total_discount_vnd: 0, addonVouchers: [], addons: [] })) };
      states.customerB.vouchers[0].status = "RESERVED";
      if (mode === "corrupt-shipping") order.shipping_fee_vnd = 19_000;
      if (mode === "corrupt-link") order.freeship_voucher_id = null;
      return { ok: true, status: 201, body: { data: structuredClone(order) } };
    }
    if (!order) throw new Error("missing fixture order");
    if (path.includes("confirm-payment")) {
      if (mode === "ambiguous-confirm") throw new AmbiguousMutation();
      order.status = "ADMIN_CONFIRMED"; order.payment_confirmed_by = "admin";
      order.payment_confirmed_at = new Date(clock).toISOString();
      Object.assign(states.customerB.vouchers[0], { status: "REDEEMED", used_channel: "ONLINE",
        redeemed_by: "admin", redeemed_at: new Date(clock).toISOString() });
      if (["old-payment", "cancel-assets-drift"].includes(mode)) order.payment_confirmed_at = new Date(clock - 86_400_000).toISOString();
      if (mode === "old-redemption") states.customerB.vouchers[0].redeemed_at = new Date(clock - 86_400_000).toISOString();
    } else if (options.body?.status === "STAFF_DONE") {
      order.status = "STAFF_DONE"; order.handled_by = "staff";
      if (mode === "changed-link") order.freeship_voucher_id = null;
      if (mode === "changed-discount-link") order.discountVouchers = [{ voucher_id: "unexpected" }];
      if (mode === "changed-bundle-link") order.bundleApplications = [{ voucher_id: "unexpected" }];
      if (mode === "changed-item-link") (order.items as Array<Record<string, unknown>>)[0].product_voucher_id = "unexpected";
    } else if (options.body?.status === "COMPLETED" && order.status === "STAFF_DONE") {
      order.status = "COMPLETED"; order.points_earned = mode === "corrupt-points" ? 6 : 5;
      states.customerB.user.points_balance = mode === "corrupt-points" ? 106 : 105;
      if (mode === "changed-user") states.customerB.user.role = "ADMIN";
      if (mode === "changed-user-id") states.customerB.user.id = "unexpected";
      states.customerB.ledger.push({ id: "earned", user_id: "customerB", order_id: "order", delta: 5,
        reason: "order_complete", performed_by: "staff", voucher_id: null, reversed_log_id: null });
    } else if (options.body?.status === "COMPLETED") {
      if (mode === "replay-write") states.customerB.user.points_balance += 1;
      return { ok: false, status: 400, body: { code: "INVALID_TRANSITION" } };
    } else if (options.body?.status === "CANCELLED") {
      order.status = "CANCELLED"; states.customerB.vouchers[0] = structuredClone(voucher);
      if (mode === "cancel-assets-drift") states.customerB.user.points_balance++;
    }
    return { ok: true, status: 200, body: { data: structuredClone(order) } };
  } });
  const catalog = { fingerprint: "catalog", items: [{ id: "latte", category: "latte", is_available: true,
    matcha_powder_id: "powder", sizes: [{ size: "SMALL", base_price_vnd: 10_000 }] }],
    powders: [{ id: "powder", price_per_gram: 2_000, powderSizeConfigs: [] }],
    liquids: [{ id: "milk", is_default: true, price_per_ml: 10 }],
    defaults: [{ size: "SMALL", powder_gram: 3, milk_ml: 100 }], addonGroups: [] };
  const actorStates = Object.fromEntries(Object.entries(states).map(([name, state]) => [name,
    { ...structuredClone(state), addresses: name === "customerB" ? [address] : [], orders: [] }]));
  if (mode === "extras") Object.assign(catalog.items[0], { category: "extras", unit_price_vnd: 17_000 });
  if (mode === "missing-address") actorStates.customerB.addresses = [];
  if (mode === "missing-voucher") actorStates.customerB.vouchers = [];
  const ctx = { runId: "run_12345678", runDir: "unused", origin: "https://test.invalid", now: () => clock,
    catalog, actorStates, credentials: Object.fromEntries(Object.entries(states).map(([name, state]) =>
      [name, { phone: `phone-${name}`, password: "synthetic", role: state.user.role }])), journal,
    pacer: { async reserve(_id: string, count: number) {
      paces.push(count);
      if (["pacing-unavailable", "pacing-drift"].includes(mode)) {
        if (mode === "pacing-drift") states.customerB.user.points_balance++;
        throw new PrerequisiteMissing("TEST_PACING_UNAVAILABLE");
      }
      if (mode === "address-changed") address.distance_km = 4;
      if (mode === "voucher-expired") { clock += 600_000; states.customerB.vouchers[0].expires_at = new Date(clock - 1).toISOString(); }
    } }, runState: { addMarker() {}, addVoucher() {}, addSession() {} },
    actorLifecycle: {
      async login({ name }: { name: string }) {
        logins.push(name);
        states[name].sessions.push({ id: `run-session-${name}` });
        return { name, sessionId: `run-session-${name}`, api: api(name) };
      },
      async logout(actor: { name: string }) {
        logouts.push(actor.name); states[actor.name].sessions = [{ id: `old-session-${actor.name}` }];
        if (mode === "session-remained") states[actor.name].sessions.push({ id: `run-session-${actor.name}` });
        if (mode === "final-shipping" && order) order.shipping_fee_vnd = 19_000;
        if (mode === "final-link" && order) order.freeship_voucher_id = null;
      },
    },
    db: { async actorState(id: string) { return structuredClone(states[id]); },
      async actor() { return { id: "customerB", role: "CUSTOMER", addresses: mode === "address-unavailable" ? [] : [structuredClone(address)] }; },
      async vouchers(ids: string[]) { return mode === "voucher-unavailable" ? [] : structuredClone(states.customerB.vouchers.filter(item => ids.includes(String(item.id)))); },
      async order() { return structuredClone(order); },
      async ordersByMarkers(markers: string[]) { return order && markers.includes(String(order.note)) ? [structuredClone(order)] : []; },
      async activeUses() { return order && !["COMPLETED", "CANCELLED"].includes(String(order.status)) ? [{ id: "order" }] : []; },
      async catalog() { return { fingerprint: "catalog" }; } },
  };
  return { ctx, states, writes, logins, logouts, paces, getOrder: () => order, getSubmitted: () => submitted };
}

describe("FREESHIP cuối trên staging", () => {
  it.each(["address-unavailable", "voucher-unavailable"])("thiếu %s sau pacing nhưng tài sản nguyên vẹn thì PARTIAL", async mode => {
    const test = boundary(mode);
    expect(await runFinalFreeshipLifecycle(test.ctx)).toMatchObject({ status: "PARTIAL", recoveryRequired: false });
    expect(test.writes).toEqual([]);
  });
  it.each(["session-remained", "cancel-assets-drift", "final-link"])("không chấp nhận cleanup sai %s", async mode => {
    expect(await runFinalFreeshipLifecycle(boundary(mode).ctx)).toMatchObject({ status: "FAIL", recoveryRequired: true });
  });
  it("reconcile cuối vẫn phát hiện snapshot tiền bị thay đổi", async () => {
    expect(await runFinalFreeshipLifecycle(boundary("final-shipping").ctx)).toMatchObject({ status: "FAIL", code: "FINAL_FREESHIP_SNAPSHOT_CHANGED" });
  });
  it.each(["missing-address", "missing-voucher", "infeasible"])("thiếu điều kiện %s thì PARTIAL không login hoặc ghi", async mode => {
    const test = boundary(mode);
    expect(await runFinalFreeshipLifecycle(test.ctx)).toMatchObject({ status: "PARTIAL" });
    expect(test.writes).toEqual([]);
    expect(test.logins).toEqual([]);
  });
  it.each(["address-changed", "voucher-expired", "pacing-drift"])("dừng trước dispatch khi %s", async mode => {
    const test = boundary(mode);
    expect(await runFinalFreeshipLifecycle(test.ctx)).toMatchObject({ status: "FAIL" });
    expect(test.writes).toEqual([]);
    expect(test.logins).toEqual([]);
  });
  it.each(["changed-discount-link", "changed-bundle-link", "changed-item-link", "changed-user-id", "corrupt-points", "replay-write"])("phát hiện sai lệch %s", async mode => {
    expect(await runFinalFreeshipLifecycle(boundary(mode).ctx)).toMatchObject({ status: "FAIL" });
  });
  it.each(["corrupt-shipping", "corrupt-link", "old-payment", "old-redemption"])("lỗi %s hủy đúng đơn, khôi phục tài sản, giữ audit và xóa session run", async mode => {
    const test = boundary(mode);
    const baseline = structuredClone(test.states);
    expect(await runFinalFreeshipLifecycle(test.ctx)).toMatchObject({ status: "FAIL", recoveryRequired: false });
    expect(test.getOrder()).toMatchObject({ id: "order", status: "CANCELLED" });
    expect(test.states).toEqual(baseline);
    expect(test.logouts.sort()).toEqual(["admin", "customerB", "staff"]);
  });
  it("mất response chưa rõ kết quả thì không retry, không cleanup và giữ session để recovery", async () => {
    const test = boundary("ambiguous-confirm");
    await expect(runFinalFreeshipLifecycle(test.ctx)).rejects.toMatchObject({ code: "MUTATION_OUTCOME_AMBIGUOUS" });
    expect(test.writes).toEqual(["/api/orders", "/api/admin/orders/order/confirm-payment"]);
    expect(test.logouts).toEqual([]);
    expect(test.states.customerB.sessions).toContainEqual({ id: "run-session-customerB" });
  });
  it("trả PARTIAL nếu pacing thiếu quota và mọi tài sản nguyên vẹn", async () => {
    const test = boundary("pacing-unavailable");
    expect(await runFinalFreeshipLifecycle(test.ctx)).toMatchObject({ status: "PARTIAL", code: "TEST_PACING_UNAVAILABLE" });
    expect(test.writes).toEqual([]);
  });
  it("không nhận user đổi role làm baseline thành công", async () => {
    expect(await runFinalFreeshipLifecycle(boundary("changed-user").ctx)).toMatchObject({ status: "FAIL", code: "FINAL_FREESHIP_POINTS_INVALID" });
  });
  it("phát hiện DB freeship link đổi sau xác nhận", async () => {
    const test = boundary("changed-link");
    expect(await runFinalFreeshipLifecycle(test.ctx)).toMatchObject({ status: "FAIL", code: "FINAL_FREESHIP_SNAPSHOT_CHANGED" });
  });
  it("chấp nhận extras lưu size null và vẫn kiểm chứng giá độc lập", async () => {
    const test = boundary("extras");
    expect(await runFinalFreeshipLifecycle(test.ctx)).toMatchObject({ status: "PASS", summary: { pointsAwarded: 5 } });
  });
  it("tạo một DELIVERY 51k, phí 18k được miễn và chỉ cộng 5 cá hàng hoá khi hoàn tất", async () => {
    const { ctx, states, getOrder } = boundary();
    const result = await runFinalFreeshipLifecycle(ctx);
    expect(result).toMatchObject({ status: "PASS", summary: { ordersCompleted: 1, shippingFeeVnd: 18_000,
      freeshipDiscountVnd: 18_000, pointsAwarded: 5 } });
    expect(getOrder()).toMatchObject({ status: "COMPLETED", total_vnd: 51_000, grand_total_vnd: 51_000 });
    expect(states.customerB.user.points_balance).toBe(105);
  });
});
