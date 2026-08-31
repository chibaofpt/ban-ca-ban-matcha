// @vitest-environment node

import { describe, expect, it } from "vitest";
import { runFinalVoucherLifecycle, selectFinalVoucherCase } from "../../scripts/staging-tests/journeys/final-voucher.mjs";
import { createJournal } from "../../scripts/staging-tests/journal.mjs";
import { AmbiguousMutation } from "../../scripts/staging-tests/http.mjs";

const catalog = { fingerprint: "catalog", items: [{ id: "latte", category: "latte", is_available: true,
  matcha_powder_id: "powder", sizes: [{ size: "SMALL", base_price_vnd: 10_000 }] }],
  powders: [{ id: "powder", price_per_gram: 2_000, powderSizeConfigs: [] }],
  liquids: [{ id: "milk", is_default: true, price_per_ml: 10 }],
  defaults: [{ size: "SMALL", powder_gram: 3, milk_ml: 100 }], addonGroups: [] };
const product = { id: "product", qr_token: "product-token", voucher_type: "PRODUCT", status: "ACTIVE",
  menu_item_id: "latte", covered_price_vnd: 30_000, expires_at: null, package: { ends_at: null } };
const discount = { id: "discount", qr_token: "discount-token", voucher_type: "DISCOUNT", status: "ACTIVE",
  discount_type: "FIXED", discount_value: 10_000, min_order_vnd: 50_000, expires_at: null, package: { ends_at: null } };
const productBoundaryA = { ...product, id: "product-a", qr_token: "product-token-a", covered_price_vnd: 23_000 };
const productBoundaryB = { ...product, id: "product-b", qr_token: "product-token-b", covered_price_vnd: 23_000 };
const fixedBoundary = { ...discount, id: "fixed", qr_token: "fixed-token", min_order_vnd: 60_000 };
const percentBoundary = { ...discount, id: "percent", qr_token: "percent-token", discount_type: "PERCENT",
  discount_value: 10, min_order_vnd: 60_000 };

function boundary(mode = "normal") {
  let clock = Date.parse("2026-09-01T00:00:00Z");
  const states: Record<string, { user: { id: string; role: string; points_balance: number };
    vouchers: Array<Record<string, unknown>>; ledger: Array<Record<string, unknown>>;
    sessions: Array<{ id: string }>; grants: unknown[] }> = {};
  const initialWallet = mode === "aggregate-no-percent"
    ? [productBoundaryA, productBoundaryB, fixedBoundary]
    : mode.startsWith("aggregate")
      ? [productBoundaryA, productBoundaryB, percentBoundary, fixedBoundary] : [product, discount];
  const aggregate = mode.startsWith("aggregate");
  const fixedPercent = aggregate && mode !== "aggregate-no-percent";
  for (const [name, role] of [["customerB", "CUSTOMER"], ["staff", "STAFF"], ["admin", "ADMIN"]]) {
    states[name] = { user: { id: name, role, points_balance: 100 }, sessions: [{ id: `old-${name}` }],
      vouchers: name === "customerB" ? structuredClone(initialWallet) : [],
      ledger: [{ id: `old-log-${name}`, delta: 100 }], grants: [] };
  }
  let order: Record<string, unknown> | null = null;
  const writes: string[] = [];
  const logouts: string[] = [];
  const markers: string[] = [];
  const intents: Array<Record<string, unknown>> = [];
  const journal = createJournal({ rootDir: "D:/test-journal", runId: "run_12345678",
    now: () => new Date(clock),
    fs: { mkdirSync() {}, appendFileSync(_path: string, content: string) {
      const entry = JSON.parse(content) as { state: string; recovery: Record<string, unknown> };
      if (entry.state === "INTENT") intents.push(entry.recovery);
    } } });
  const publicOrder = () => {
    const value = structuredClone(order);
    if (value) value.items = (value.items as Array<Record<string, unknown>>).map(item => {
      const publicItem = { ...item }; delete publicItem.product_voucher_id; delete publicItem.item_voucher_id;
      if (mode === "api-discount-corrupt") publicItem.total_discount_vnd = 9_000;
      return publicItem;
    });
    return value;
  };
  const api = (name: string) => ({ async request(path: string, options: { method?: string; body?: Record<string, unknown> } = {}) {
    if (!options.method) return { ok: true, status: 200, body: { data: path === "/api/profile"
      ? { points_balance: states.customerB.user.points_balance } : publicOrder() } };
    writes.push(path); expect(intents.at(-1)?.actor).toBe(name);
    if (path === "/api/orders") {
      const body = options.body as { note: string; items: Array<Record<string, unknown>> };
      const stacked = mode !== "no-discount";
      order = { id: "order", user_id: "customerB", status: "PENDING", note: body.note, order_type: "PICKUP",
        subtotal_vnd: aggregate ? 102_000 : stacked ? 68_000 : 34_000,
        total_voucher_discount_vnd: aggregate ? fixedPercent ? 15_000 : 10_000 : stacked ? 10_000 : 0,
        total_vnd: aggregate ? fixedPercent ? 53_000 : 58_000 : stacked ? 41_000 : 17_000,
        grand_total_vnd: aggregate ? fixedPercent ? 53_000 : 58_000 : stacked ? 41_000 : 17_000,
        shipping_fee_vnd: 0, freeship_discount_vnd: 0, points_earned: null, handled_by: null,
        payment_confirmed_by: null, payment_confirmed_at: null, freeship_voucher_id: null,
        discountVouchers: aggregate ? [...(fixedPercent ? [{ voucher_id: "percent" }] : []), { voucher_id: "fixed" }]
          : stacked ? [{ voucher_id: "discount" }] : [], bundleApplications: [],
        items: body.items.map(item => ({ ...item,
          product_voucher_id: item.product_voucher_id === "product-token-a" ? "product-a"
            : item.product_voucher_id === "product-token-b" ? "product-b"
              : item.product_voucher_id ? "product" : null,
          product_voucher_discount_vnd: item.product_voucher_id ? 17_000 : 0,
          total_discount_vnd: item.product_voucher_id ? 17_000 : 0,
          item_voucher_id: null, addons: [], addonVouchers: [], unit_price_vnd: 17_000, addons_price_vnd: 0,
          selected_powder_id: "powder", selected_milk_type_id: "milk", base_liquid_ml: 100 })) };
      states.customerB.vouchers.forEach(voucher => { voucher.status = "RESERVED"; });
      if (mode === "aggregate-wrong-stack") {
        order.total_voucher_discount_vnd = 16_000; order.total_vnd = 52_000; order.grand_total_vnd = 52_000;
      }
      if (mode === "bad-line") (order.items as Array<Record<string, unknown>>)[0].unit_price_vnd = 18_000;
      if (mode === "bad-sweetness") (order.items as Array<Record<string, unknown>>)[0].sweetness = "LESS";
      if (mode.startsWith("cleanup-")) (order.items as Array<Record<string, unknown>>)[0].sweetness = "LESS";
      if (mode === "pending-redemption") states.customerB.vouchers[0].redeemed_at = new Date(clock).toISOString();
      if (mode === "moved-discount") {
        const lines = order.items as Array<Record<string, unknown>>;
        lines[0].total_discount_vnd = 0; lines[0].product_voucher_discount_vnd = 0;
        lines[1].total_discount_vnd = 17_000; lines[1].product_voucher_discount_vnd = 17_000;
      }
      return { ok: true, status: 201, body: { data: publicOrder() } };
    }
    if (path.includes("confirm-payment")) {
      if (mode === "ambiguous") throw new AmbiguousMutation();
      if (!order) throw new Error("missing fixture order");
      order.status = "ADMIN_CONFIRMED"; order.payment_confirmed_by = "admin";
      order.payment_confirmed_at = new Date(clock).toISOString();
      if (mode === "old-payment-time") order.payment_confirmed_at = new Date(clock - 86_400_000).toISOString();
      if (mode === "future-payment-time") order.payment_confirmed_at = new Date(clock + 86_400_000).toISOString();
      states.customerB.vouchers.forEach(voucher => {
        voucher.status = "REDEEMED"; voucher.used_channel = "ONLINE";
        voucher.redeemed_by = "admin"; voucher.redeemed_at = new Date(clock).toISOString();
      });
      if (mode === "wrong-redemption") states.customerB.vouchers[0].used_channel = "OFFLINE";
      if (mode === "future-redemption") states.customerB.vouchers[0].redeemed_at = new Date(clock + 86_400_000).toISOString();
      if (mode === "old-redemption") states.customerB.vouchers[0].redeemed_at = new Date(clock - 86_400_000).toISOString();
      if (mode === "early-points") states.customerB.user.points_balance += 1;
    } else {
      if (!order) throw new Error("missing fixture order");
      const target = options.body?.status;
      if (target === "CANCELLED") {
        order.status = "CANCELLED";
        states.customerB.vouchers = structuredClone(initialWallet);
        if (mode === "cleanup-ledger") states.customerB.ledger[0].delta = 99;
        if (mode === "cleanup-voucher") states.customerB.vouchers[0].status = "RESERVED";
        if (mode === "cleanup-grant") states.customerB.grants.push({ id: "unexpected" });
      } else if (target === "COMPLETED" && order.status === "COMPLETED") {
        if (mode === "replay-write") states.customerB.user.points_balance += 1;
        return { ok: false, status: 400, body: { code: "INVALID_TRANSITION" } };
      } else if (target === "COMPLETED") {
        order.status = "COMPLETED"; order.points_earned = mode === "no-discount" ? 1 : aggregate ? 5 : 4;
        const earned = mode === "no-discount" ? 1 : aggregate ? 5 : 4;
        states.customerB.user.points_balance += earned + 1;
        states.customerB.ledger.push(
          { id: "earned", reason: "order_complete", order_id: "order", user_id: "customerB", delta: earned,
            performed_by: "staff", voucher_id: null, reversed_log_id: null },
          { id: "surplus", reason: "voucher_surplus", order_id: "order", user_id: "customerB", delta: 1,
            performed_by: "staff", voucher_id: null, reversed_log_id: null });
        if (mode === "aggregate-per-voucher-logs") {
          states.customerB.ledger.pop();
          states.customerB.ledger.push(
            { id: "surplus-a", reason: "voucher_surplus", order_id: "order", user_id: "customerB", delta: 1,
              performed_by: "staff", voucher_id: "product-a", reversed_log_id: null },
            { id: "surplus-b", reason: "voucher_surplus", order_id: "order", user_id: "customerB", delta: 0,
              performed_by: "staff", voucher_id: "product-b", reversed_log_id: null });
        }
        if (mode === "aggregate-duplicate-log") states.customerB.ledger.push({ ...states.customerB.ledger.at(-1), id: "surplus-duplicate" });
        if (mode === "double-surplus") states.customerB.ledger.push({ ...states.customerB.ledger.at(-1), id: "duplicate" });
      } else {
        order.status = target; order.handled_by = "staff";
        if (mode === "rewrite-config") (order.items as Array<Record<string, unknown>>)[0].coldwhisk = true;
        if (mode === "rewrite-payment-time") order.payment_confirmed_at = new Date(clock + 1_000).toISOString();
        if (mode === "rewrite-redeemed-time") states.customerB.vouchers[0].redeemed_at = new Date(clock + 1_000).toISOString();
      }
    }
    return { ok: true, status: 200, body: { data: publicOrder() } };
  } });
  const ctx = { catalog: structuredClone(catalog), runId: "run_12345678", runDir: "unused", origin: "https://test.invalid",
    now: () => clock, actorStates: structuredClone(states), journal,
    credentials: Object.fromEntries(Object.entries(states).map(([name, state]) => [name,
      { phone: "synthetic", password: "synthetic", role: state.user.role }])),
    pacer: { async reserve() { if (mode === "expires-during-pacing") clock += 600_000; } },
    runState: { addMarker(marker: string) { markers.push(marker); }, addVoucher() {}, addSession() {} },
    actorLifecycle: {
      async login({ name }: { name: string }) {
        states[name].sessions.push({ id: `run-session-${name}` });
        return { name, sessionId: `run-session-${name}`, api: api(name) };
      },
      async logout(actor: { name: string }) {
        logouts.push(actor.name); states[actor.name].sessions = [{ id: `old-${actor.name}` }];
        if (mode === "missing-audit") order = null;
      },
    },
    db: { async actorState(id: string) { return structuredClone(states[id]); },
      async order() { return structuredClone(order); },
      async ordersByMarkers(values: string[]) {
        if (mode === "collision") return [{ id: "foreign", user_id: "customerB", status: "PENDING", note: values[0] }];
        return order && values.includes(String(order.note)) ? [structuredClone(order)] : [];
      },
      async vouchers(ids: string[]) { return structuredClone(states.customerB.vouchers.filter(voucher => ids.includes(String(voucher.id)))); },
      async activeUses() {
        return order && (! ["COMPLETED", "CANCELLED"].includes(String(order.status))
          || mode === "cleanup-reservation") ? [{ id: "order" }] : [];
      },
      async catalog() { return { fingerprint: "catalog" }; },
    } };
  if (mode === "expires-during-pacing") states.customerB.vouchers.forEach(voucher => { voucher.expires_at = new Date(clock + 500_000).toISOString(); });
  if (mode === "no-discount") states.customerB.vouchers = [structuredClone(product)];
  return { ctx, states, writes, logouts, markers, getOrder: () => order };
}

describe("Chọn order redeem voucher cuối", () => {
  it("chọn hai PRODUCT 6k+6k và cố ý gửi PERCENT trước FIXED nhưng quote theo FIXED rồi PERCENT", () => {
    const selected = selectFinalVoucherCase({ catalog, runId: "run_12345678",
      wallet: [productBoundaryA, productBoundaryB, percentBoundary, fixedBoundary] });
    expect(selected.productVouchers.map((voucher: { id: string }) => voucher.id)).toEqual(["product-a", "product-b"]);
    expect(selected.payload.items.filter((item: { product_voucher_id?: string }) => item.product_voucher_id)
      .map((item: { product_voucher_id: string }) => item.product_voucher_id)).toEqual(["product-token-a", "product-token-b"]);
    expect(selected.payload.discount_voucher_ids).toEqual(["percent-token", "fixed-token"]);
    expect(selected).toMatchObject({ aggregateBoundary: true, fixedPercentBoundary: true,
      expected: { subtotal_vnd: 102_000, item_discount_vnd: 34_000,
        total_voucher_discount_vnd: 15_000, total_vnd: 53_000, surplusPoints: 1 } });
    expect(selected.requestOrderDiscountVnd).toBe(16_000);
  });
  it("không mua voucher thay thế khi ví không còn PRODUCT ACTIVE", () => {
    expect(() => selectFinalVoucherCase({ catalog, runId: "run_12345678", wallet: [discount] }))
      .toThrow("FINAL_ACTIVE_PRODUCT_MISSING");
  });
  it("tìm thêm đơn vị trả tiền để đạt minimum sau PRODUCT mà không vượt quota một order", () => {
    const selected = selectFinalVoucherCase({ catalog, runId: "run_12345678", wallet: [product, discount] });
    expect(selected.payload.items.map((item: { quantity: number }) => item.quantity)).toEqual([1, 3]);
    expect(selected.payload.discount_voucher_ids).toEqual(["discount-token"]);
    expect(selected.expected).toMatchObject({ subtotal_vnd: 68_000, item_discount_vnd: 17_000,
      total_voucher_discount_vnd: 10_000, total_vnd: 41_000, orderPoints: 4, surplusPoints: 1 });
  });
});

describe("Lifecycle cuối với PRODUCT và DISCOUNT", () => {
  it.each(["aggregate-per-voucher-logs", "aggregate-duplicate-log"])
  ("không chấp nhận ledger surplus theo từng voucher hoặc bị lặp: %s", async mode => {
    const { ctx } = boundary(mode);
    expect(await runFinalVoucherLifecycle(ctx)).toMatchObject({ status: "FAIL", code: "FINAL_VOUCHER_LEDGER_INVALID" });
  });
  it("không chấp nhận server áp dụng PERCENT trước FIXED theo thứ tự request", async () => {
    const { ctx } = boundary("aggregate-wrong-stack");
    expect(await runFinalVoucherLifecycle(ctx)).toMatchObject({ status: "FAIL",
      code: "SMOKE_CREATE_TOTAL_TOTAL_VOUCHER_DISCOUNT_VND" });
  });
  it("PASS aggregation nhưng PARTIAL fixed-percent khi ví thiếu PERCENT", async () => {
    const { ctx } = boundary("aggregate-no-percent");
    const result = await runFinalVoucherLifecycle(ctx);
    expect(result).toMatchObject({ status: "PARTIAL" });
    expect(result.cases).toContainEqual({ id: "product-surplus-aggregation", status: "PASS" });
    expect(result.cases).toContainEqual({ id: "voucher-stacking-fixed-percent", status: "PARTIAL",
      code: "FINAL_FIXED_PERCENT_STACK_DATA_MISSING" });
  });
  it("hoàn tất một order với hai PRODUCT boundary và FIXED→PERCENT dù payload đảo thứ tự", async () => {
    const { ctx, states } = boundary("aggregate");
    const result = await runFinalVoucherLifecycle(ctx);
    expect(result).toMatchObject({ status: "PASS", summary: { ordersCompleted: 1, pointsAwarded: 5,
      surplusPointsAwarded: 1, stackedDiscount: true } });
    expect(result.cases).toContainEqual({ id: "product-surplus-aggregation", status: "PASS" });
    expect(result.cases).toContainEqual({ id: "voucher-stacking-fixed-percent", status: "PASS" });
    expect(states.customerB.ledger.filter(log => log.reason === "voucher_surplus")).toHaveLength(1);
  });
  it.each(["cleanup-ledger", "cleanup-voucher", "cleanup-grant", "cleanup-reservation"])
  ("đối soát dữ liệu sau huỷ và giữ session khi cleanup còn sai: %s", async mode => {
    const { ctx, logouts } = boundary(mode);
    expect(await runFinalVoucherLifecycle(ctx)).toMatchObject({ status: "FAIL",
      code: "FINAL_VOUCHER_INITIAL_LINE_INVALID", recoveryRequired: true,
      recoveryCode: mode === "cleanup-reservation" ? "FINAL_VOUCHER_CANCELLED_RESERVATION_REMAINED"
        : "FINAL_VOUCHER_CANCELLED_ASSETS_NOT_RESTORED" });
    expect(logouts).toEqual([]);
  });
  it("đối chiếu discount từng dòng của public API với oracle độc lập", async () => {
    const { ctx } = boundary("api-discount-corrupt");
    expect(await runFinalVoucherLifecycle(ctx)).toMatchObject({ status: "FAIL", code: "FINAL_VOUCHER_SNAPSHOT_CHANGED" });
  });
  it.each([
    ["future-payment-time", "FINAL_VOUCHER_PAYMENT_TIMESTAMP_INVALID"],
    ["future-redemption", "FINAL_VOUCHER_REDEMPTION_METADATA_INVALID"],
    ["old-redemption", "FINAL_VOUCHER_REDEMPTION_METADATA_INVALID"],
    ["pending-redemption", "FINAL_VOUCHER_RESERVED_METADATA_INVALID"],
    ["rewrite-payment-time", "FINAL_VOUCHER_PAYMENT_METADATA_CHANGED"],
    ["rewrite-redeemed-time", "FINAL_VOUCHER_REDEEMED_TWICE"],
  ])("đối chiếu timestamp và giữ metadata bất biến: %s", async (mode, code) => {
    const { ctx } = boundary(mode);
    expect(await runFinalVoucherLifecycle(ctx)).toMatchObject({ status: "FAIL", code });
  });
  it("đánh dấu cần recovery khi cộng cá sớm còn tồn tại sau huỷ", async () => {
    const { ctx, getOrder } = boundary("early-points");
    expect(await runFinalVoucherLifecycle(ctx)).toMatchObject({ status: "FAIL", code: "FINAL_VOUCHER_POINTS_INVALID", recoveryRequired: true });
    expect(getOrder()?.status).toBe("CANCELLED");
  });
  it("từ chối payment timestamp cũ ngoài cửa sổ confirm", async () => {
    const { ctx } = boundary("old-payment-time");
    expect(await runFinalVoucherLifecycle(ctx)).toMatchObject({ status: "FAIL", code: "FINAL_VOUCHER_PAYMENT_TIMESTAMP_INVALID" });
  });
  it("phát hiện discount chuyển sai dòng dù tổng discount giữ nguyên", async () => {
    const { ctx } = boundary("moved-discount");
    expect(await runFinalVoucherLifecycle(ctx)).toMatchObject({ status: "FAIL", code: "FINAL_VOUCHER_INITIAL_LINE_INVALID" });
  });
  it("giữ nguyên coldwhisk qua STAFF_DONE", async () => {
    const { ctx } = boundary("rewrite-config");
    expect(await runFinalVoucherLifecycle(ctx)).toMatchObject({ status: "FAIL", code: "FINAL_VOUCHER_SNAPSHOT_CHANGED" });
  });
  it("phát hiện sweetness sai ở snapshot đầu dù giá không đổi", async () => {
    const { ctx } = boundary("bad-sweetness");
    expect(await runFinalVoucherLifecycle(ctx)).toMatchObject({ status: "FAIL", code: "FINAL_VOUCHER_INITIAL_LINE_INVALID" });
  });
  it("không lấy snapshot sai giá của server làm đáp án dù order total đúng", async () => {
    const { ctx } = boundary("bad-line");
    expect(await runFinalVoucherLifecycle(ctx)).toMatchObject({ status: "FAIL", code: "FINAL_VOUCHER_INITIAL_LINE_INVALID" });
  });
  it("không công bố case PASS khi lỗi trước khi redeem hoàn tất", async () => {
    const { ctx, getOrder } = boundary("early-points");
    const result = await runFinalVoucherLifecycle(ctx);
    expect(result).toMatchObject({ status: "FAIL", code: "FINAL_VOUCHER_POINTS_INVALID" });
    expect(result.cases.some((item: { status: string }) => item.status === "PASS")).toBe(false);
    expect(getOrder()?.status).toBe("CANCELLED");
  });
  it("dừng mọi ghi và giữ session recovery khi confirm mất response không rõ outcome", async () => {
    const { ctx, writes, logouts } = boundary("ambiguous");
    await expect(runFinalVoucherLifecycle(ctx)).rejects.toMatchObject({ code: "MUTATION_OUTCOME_AMBIGUOUS" });
    expect(writes).toEqual(["/api/orders", "/api/admin/orders/order/confirm-payment"]);
    expect(logouts).toEqual([]);
  });
  it("không cleanup hay nhận sở hữu marker tồn tại trước test", async () => {
    const { ctx, writes, markers } = boundary("collision");
    expect(await runFinalVoucherLifecycle(ctx)).toMatchObject({ status: "FAIL", code: "SMOKE_MARKER_COLLISION" });
    expect(writes).toEqual([]); expect(markers).toEqual([]);
  });
  it("phát hiện hai log surplus dù số dư khớp", async () => {
    const { ctx } = boundary("double-surplus");
    expect(await runFinalVoucherLifecycle(ctx)).toMatchObject({ status: "FAIL", code: "FINAL_VOUCHER_LEDGER_INVALID" });
  });
  it("phát hiện request replay bị từ chối nhưng vẫn cộng cá", async () => {
    const { ctx } = boundary("replay-write");
    expect(await runFinalVoucherLifecycle(ctx)).toMatchObject({ status: "FAIL", code: "FINAL_VOUCHER_REPLAY_CHANGED_STATE" });
  });
  it("giữ PARTIAL stacking khi chỉ có PRODUCT nhưng hoàn tất core lifecycle", async () => {
    const { ctx } = boundary("no-discount");
    const result = await runFinalVoucherLifecycle(ctx);
    expect(result).toMatchObject({ status: "PARTIAL" });
    expect(result.cases).toContainEqual({ id: "online-final-voucher-redemption", status: "PASS" });
    expect(result.cases).toContainEqual({ id: "voucher-stacking-after-product", status: "PARTIAL", code: "FINAL_DISCOUNT_STACK_DATA_MISSING" });
  });
  it("không PASS khi audit order hoàn tất bị mất trong logout", async () => {
    const { ctx } = boundary("missing-audit");
    expect(await runFinalVoucherLifecycle(ctx)).toMatchObject({ status: "FAIL", code: "FINAL_VOUCHER_TERMINAL_AUDIT_MISSING" });
  });
  it("không chấp nhận voucher redeem sai channel dù lifecycle và tổng tiền vẫn đúng", async () => {
    const { ctx } = boundary("wrong-redemption");
    expect(await runFinalVoucherLifecycle(ctx)).toMatchObject({ status: "FAIL", code: "FINAL_VOUCHER_REDEMPTION_METADATA_INVALID" });
  });
  it("kiểm tra lại hạn voucher sau pacing trước khi login và tạo order", async () => {
    const { ctx, writes, logouts, markers } = boundary("expires-during-pacing");
    expect(await runFinalVoucherLifecycle(ctx)).toMatchObject({ status: "PARTIAL", code: "FINAL_VOUCHER_EXPIRES_AFTER_PACING" });
    expect(writes).toEqual([]); expect(logouts).toEqual([]); expect(markers).toEqual([]);
  });
  it("đối chiếu user actor riêng session, thưởng cuối và báo gap aggregation khi chỉ có một PRODUCT", async () => {
    const { ctx, states, writes, logouts, getOrder } = boundary();
    const result = await runFinalVoucherLifecycle(ctx);
    expect(result.code).toBeUndefined();
    expect(result).toMatchObject({ status: "PARTIAL", summary: { ordersCompleted: 1, pointsAwarded: 4, surplusPointsAwarded: 1 } });
    expect(result.cases).toContainEqual({ id: "online-final-voucher-redemption", status: "PASS" });
    expect(result.cases).toContainEqual({ id: "product-surplus-aggregation", status: "PARTIAL", code: "FINAL_MULTI_PRODUCT_BOUNDARY_MISSING" });
    expect(result.cases).toContainEqual({ id: "voucher-stacking-fixed-percent", status: "PARTIAL", code: "FINAL_FIXED_PERCENT_STACK_DATA_MISSING" });
    expect(getOrder()?.status).toBe("COMPLETED");
    expect(states.customerB.user.points_balance).toBe(105);
    expect(writes.filter(path => path === "/api/orders")).toHaveLength(1);
    expect(logouts.sort()).toEqual(["admin", "customerB", "staff"]);
  });
});
