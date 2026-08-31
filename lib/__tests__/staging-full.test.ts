// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildPickupCase } from "../../scripts/staging-tests/journeys/common.mjs";
import { createVerifiedPickup } from "../../scripts/staging-tests/journeys/order.mjs";
import { runFullJourney } from "../../scripts/staging-tests/journeys/full.mjs";
import { AmbiguousMutation } from "../../scripts/staging-tests/http.mjs";
import { acquireSmokeDiscount } from "../../scripts/staging-tests/journeys/voucher.mjs";
import { selectPriceCases } from "../../scripts/staging-tests/journeys/full-cases.mjs";

const catalog = {
  items: [
    { id: "latte", category: "latte", is_available: true, matcha_powder_id: "powder", sizes: [{ size: "SMALL", base_price_vnd: 10_000 }] },
    { id: "extra", category: "extras", is_available: true, unit_price_vnd: 7_000, sizes: [] as Array<{ size: string; base_price_vnd: number }> },
  ],
  powders: [{ id: "powder", price_per_gram: 2_000, powderSizeConfigs: [] }],
  liquids: [{ id: "milk", is_default: true, price_per_ml: 10 }],
  defaults: [{ size: "SMALL", powder_gram: 3, milk_ml: 100 }],
  addonGroups: [],
};

describe("Full staging journey primitives", () => {
  it("does not call an allowed default liquid a verified swap", () => {
    const result = selectPriceCases({ ...catalog,
      items: catalog.items.map(item => ({ ...item, allowedBaseLiquids: [{ base_liquid_id: "milk" }] })) });
    expect(result.find(row => row.id === "price-latte-liquid-swap")?.lineInput).toBeNull();
  });
  it("selects opt-in, SELECTOR, TOGGLE, QUANTITY and gram/fixed addon cases from the frozen catalog", () => {
    const result = selectPriceCases({ ...catalog, addonGroups: [
      { id: "selector", type: "SELECTOR", is_active: true, max_quantity: 1,
        options: [{ id: "selector-option", is_active: true, price_vnd: 2_000, gram_value: null }] },
      { id: "toggle", type: "TOGGLE", is_active: true, max_quantity: 1,
        options: [{ id: "toggle-option", is_active: true, price_vnd: 3_000, gram_value: null }] },
      { id: "quantity", type: "QUANTITY", is_active: true, max_quantity: 3,
        options: [{ id: "quantity-option", is_active: true, price_vnd: 1_000, gram_value: null }] },
      { id: "matcha", type: "QUANTITY", is_active: true, max_quantity: 2,
        options: [{ id: "matcha-option", is_active: true, price_vnd: 0, gram_value: "1.5" }] },
    ] });
    expect(result.find(row => row.id === "addon-opt-in-none")?.lineInput?.addon_option_ids).toEqual([]);
    expect(result.find(row => row.id === "addon-selector")?.lineInput?.addon_option_ids).toEqual([{ option_id: "selector-option", quantity: 1 }]);
    expect(result.find(row => row.id === "addon-toggle")?.lineInput?.addon_option_ids).toEqual([{ option_id: "toggle-option", quantity: 1 }]);
    expect(result.find(row => row.id === "addon-quantity")?.lineInput?.addon_option_ids).toEqual([{ option_id: "quantity-option", quantity: 2 }]);
    expect(result.find(row => row.id === "addon-extra-matcha-gram")?.lineInput?.addon_option_ids).toEqual([{ option_id: "matcha-option", quantity: 1 }]);
    expect(result.find(row => row.id === "addon-fixed-price-fallback")?.lineInput).not.toBeNull();
  });
  it("quotes the explicitly selected extras line instead of silently substituting a Latte", () => {
    const result = buildPickupCase({ catalog, runId: "run_12345678", caseId: "price-extras",
      lineInput: { menu_item_id: "extra", quantity: 1, addon_option_ids: [] } });
    expect(result.payload.items[0]).toMatchObject({ menu_item_id: "extra", client_price_vnd: 7_000 });
    expect(result.expected.total_vnd).toBe(7_000);
  });
  it("submits PRODUCT credit as item-level net price, keeping gross oracle snapshots", () => {
    expect(() => buildPickupCase({ catalog, runId: "run_12345678", caseId: "product",
      lineInput: { menu_item_id: "latte", size: "SMALL", quantity: 1, addon_option_ids: [] },
      voucher: { id: "v", qr_token: "token", voucher_type: "PRODUCT", menu_item_id: "latte", covered_price_vnd: 10_000 } })).not.toThrow();
    const result = buildPickupCase({ catalog, runId: "run_12345678", caseId: "product",
      lineInput: { menu_item_id: "latte", size: "SMALL", quantity: 1, addon_option_ids: [] },
      voucher: { id: "v", qr_token: "token", voucher_type: "PRODUCT", menu_item_id: "latte", covered_price_vnd: 10_000 } });
    expect(result.payload.items[0]).toMatchObject({ product_voucher_id: "token", client_price_vnd: 7_000 });
    expect(result.payload.discount_voucher_ids).toEqual([]);
    expect(result.expected).toMatchObject({ subtotal_vnd: 17_000, item_discount_vnd: 10_000, total_vnd: 7_000 });
  });
  it("covers one extras ITEM unit without drink configuration", () => {
    const build = () => buildPickupCase({ catalog, runId: "run_12345678", caseId: "item",
      lineInput: { menu_item_id: "extra", quantity: 1, addon_option_ids: [] },
      voucher: { id: "v", qr_token: "token", voucher_type: "ITEM", menu_item_id: "extra" } });
    expect(build).not.toThrow();
    expect(build().payload.items[0]).toMatchObject({ item_voucher_id: "token", client_price_vnd: 0 });
  });
  it("honours PRODUCT_DISCOUNT allowed sizes and fixed benefit", () => {
    const input = { catalog, runId: "run_12345678", caseId: "pd",
      lineInput: { menu_item_id: "latte", size: "SMALL", quantity: 1, addon_option_ids: [] },
      voucher: { id: "v", qr_token: "token", voucher_type: "PRODUCT_DISCOUNT", menu_item_id: "latte",
        eligible_sizes: ["SMALL"], product_discount_mode: "FIXED_AMOUNT", discount_value: 5_000 } };
    expect(() => buildPickupCase(input)).not.toThrow();
    expect(buildPickupCase(input).payload.items[0].client_price_vnd).toBe(12_000);
    expect(() => buildPickupCase({ ...input, voucher: { ...input.voucher, eligible_sizes: ["MEDIUM"] } }))
      .toThrow("FULL_VOUCHER_SIZE_INELIGIBLE");
  });
  it("covers only one matching ADDON unit and never accepts Extra Matcha", () => {
    const input = { catalog: { ...catalog, addonGroups: [{ is_active: true,
      options: [{ id: "pearl", is_active: true, price_vnd: 3_000, gram_value: null }] }] },
      runId: "run_12345678", caseId: "addon", lineInput: { menu_item_id: "latte", size: "SMALL", quantity: 1,
        addon_option_ids: [{ option_id: "pearl", quantity: 3 }] },
      voucher: { id: "v", qr_token: "token", voucher_type: "ADDON", addon_option_id: "pearl" } };
    expect(() => buildPickupCase(input)).not.toThrow();
    expect(buildPickupCase(input).payload.items[0]).toMatchObject({ client_price_vnd: 23_000,
      addon_voucher_ids: [{ voucher_id: "token", addon_option_id: "pearl" }] });
  });
  it("verifies PRODUCT reservation through its item link rather than a DISCOUNT link", async () => {
    const voucher = { id: "v", qr_token: "token", voucher_type: "PRODUCT", menu_item_id: "latte", covered_price_vnd: 10_000 };
    const pickupCase = buildPickupCase({ catalog, runId: "run_12345678", caseId: "product", voucher });
    const stored = { id: "order", user_id: "customer", note: pickupCase.marker, status: "PENDING", order_type: "PICKUP",
      subtotal_vnd: 17_000, total_voucher_discount_vnd: 0, total_vnd: 7_000, shipping_fee_vnd: 0,
      freeship_discount_vnd: 0, grand_total_vnd: 7_000, discountVouchers: [],
      items: [{ note: pickupCase.marker, product_voucher_id: "v" }] };
    await expect(createVerifiedPickup({ actorName: "customerB", userId: "customer", voucher, pickupCase,
      actor: { api: { request: async (_path: string, options?: { method?: string }) =>
        ({ ok: true, status: options?.method === "POST" ? 201 : 200, body: { data: stored } }) } },
      db: { ordersByMarkers: async () => [], order: async () => stored,
        vouchers: async () => [{ ...voucher, status: "RESERVED" }], activeUses: async () => [{ id: "order" }] },
      journal: { recordIntent() {}, recordOutcome() {} },
    })).resolves.toMatchObject({ orderId: "order" });
  });
});

function fullBoundary(mode = "normal", variantFailure = "") {
  const orders = new Map<string, Record<string, unknown>>();
  const writes: string[] = [];
  const intents: Array<Record<string, unknown>> = [];
  const reservations: unknown[][] = [];
  const submitted: Array<Record<string, unknown>> = [];
  const baseline = { user: { id: "customer", role: "CUSTOMER", points_balance: 100 },
    vouchers: [] as Array<Record<string, unknown>>, ledger: [] as Array<Record<string, unknown>>, sessions: [], grants: [] };
  if (["no-benefit", "bad-unused"].includes(mode)) baseline.vouchers.push(
    { id: "product", qr_token: "product-token", voucher_type: "PRODUCT", status: "ACTIVE", menu_item_id: "latte", covered_price_vnd: 30_000 },
    { id: "discount", qr_token: "discount-token", voucher_type: "DISCOUNT", status: "ACTIVE", discount_type: "FIXED", discount_value: 10_000, min_order_vnd: 0 },
  );
  if (mode === "variants") baseline.vouchers.push(
    { id: "discount", qr_token: "discount-token", voucher_type: "DISCOUNT", status: "ACTIVE", discount_type: "FIXED", discount_value: 10_000 },
    { id: "percent", qr_token: "percent-token", voucher_type: "DISCOUNT", status: "ACTIVE", discount_type: "PERCENT", discount_value: 10 },
    { id: "fixed-product", qr_token: "fixed-product-token", voucher_type: "PRODUCT_DISCOUNT", status: "ACTIVE", menu_item_id: "latte",
      product_discount_mode: "FIXED_AMOUNT", eligible_sizes: ["SMALL"], discount_value: 5_000 },
    { id: "pay-size", qr_token: "pay-size-token", voucher_type: "PRODUCT_DISCOUNT", status: "ACTIVE", menu_item_id: "latte",
      product_discount_mode: "PAY_AS_SIZE", eligible_sizes: ["MEDIUM"], reference_size: "SMALL" },
  );
  let counter = 0;
  const api = { request: async (path: string, options: { method?: string; body?: Record<string, unknown> } = {}) => {
    if (path === "/api/profile/vouchers/exchange") {
      writes.push("exchange");
      baseline.user.points_balance -= 10;
      baseline.vouchers.push({ id: "voucher", qr_token: "token", package_id: "package", menu_item_id: "extra", voucher_type: "ITEM", status: "ACTIVE" });
      baseline.ledger.push({ id: "log", voucher_id: "voucher", delta: -10, reason: "voucher_purchase" });
      return { ok: true, status: 201, body: { data: { qr_token: "token" } } };
    }
    if (path.startsWith("/api/profile/vouchers?")) return { ok: true, status: 200, body: { data: baseline.vouchers, meta: { has_more: false } } };
    if (options.method === "POST") {
      submitted.push(structuredClone(options.body ?? {}));
      writes.push("POST");
      expect(intents.at(-1)).toMatchObject({ actor: "customerB", userId: "customer", marker: options.body?.note });
      if (mode === "ambiguous") throw new AmbiguousMutation("lost");
      const payload = options.body as { items: Array<{ menu_item_id: string; size?: string; quantity: number; client_price_vnd: number;
        item_voucher_id?: string; product_voucher_id?: string }>; note: string; discount_voucher_ids?: string[] };
      const item = payload.items[0];
      if (variantFailure === "fixed-quota" && payload.discount_voucher_ids?.includes("discount-token")) {
        return { ok: false, status: 429, body: { code: "RATE_LIMITED" } };
      }
      if (payload.discount_voucher_ids?.includes("percent-token")
        && submitted.filter(body => (body.discount_voucher_ids as string[])?.includes("percent-token")).length === 2) {
        if (variantFailure === "percent-reuse-quota") return { ok: false, status: 429, body: { code: "RATE_LIMITED" } };
        if (variantFailure === "percent-reuse-ambiguous") throw new AmbiguousMutation("lost");
      }
      const serverPrice = (line: { menu_item_id: string; size?: string }) => line.menu_item_id === "extra" ? 7_000 : line.size === "MEDIUM" ? 27_000 : 17_000;
      const netPrices: Record<string, number> = { "fixed-product-token": 12_000, "pay-size-token": 17_000, "product-token": 0 };
      const conflict = payload.items.find(line => line.client_price_vnd !== (line.item_voucher_id ? 0 : line.product_voucher_id ? netPrices[line.product_voucher_id] : serverPrice(line)));
      const total = payload.items.reduce((sum, line) => sum + serverPrice(line) * (line.quantity ?? 1), 0);
      const payable = payload.items.reduce((sum, line) => sum + line.client_price_vnd * (line.quantity ?? 1), 0);
      const discount = payload.discount_voucher_ids?.includes("discount-token") ? Math.min(payable, 10_000)
        : payload.discount_voucher_ids?.includes("percent-token") ? 2_000 : 0;
      if (mode === "price-changed") return { ok: false, status: 409, body: { code: "PRICE_CHANGED" } };
      if (conflict) return { ok: false, status: 409, body: {
        code: "PRICE_CHANGED", details: { conflicts: [{ menu_item_id: conflict.menu_item_id,
          client_price_vnd: conflict.client_price_vnd, server_price_vnd: serverPrice(conflict) }] } } };
      const stored = { id: `order-${++counter}`, user_id: "customer", status: "PENDING", order_type: "PICKUP", note: payload.note,
        items: payload.items.map((line, index) => ({ ...line,
          unit_price_vnd: mode === "bad-line" && index === 0 ? serverPrice(line) + 1 : serverPrice(line), addons_price_vnd: 0,
          selected_powder_id: line.menu_item_id === "extra" ? null : "powder",
          selected_milk_type_id: line.menu_item_id === "extra" ? null : "milk",
          base_liquid_ml: line.menu_item_id === "extra" ? null : 100, addons: [],
          product_voucher_id: baseline.vouchers.find(voucher => voucher.qr_token === line.product_voucher_id)?.id ?? null,
          item_voucher_id: line.item_voucher_id ? "voucher" : null })),
        discountVouchers: discount > 0 ? [{ voucher_id: payload.discount_voucher_ids?.includes("percent-token") ? "percent" : "discount" }] : [], subtotal_vnd: mode === "bad-total" ? total + 1 : total,
        total_voucher_discount_vnd: discount, total_vnd: payable - discount, grand_total_vnd: payable - discount,
        shipping_fee_vnd: 0, freeship_discount_vnd: 0 };
      orders.set(stored.id, stored);
      if (item.item_voucher_id) baseline.vouchers[0].status = "RESERVED";
      if (item.product_voucher_id) baseline.vouchers.find(row => row.qr_token === item.product_voucher_id)!.status = "RESERVED";
      if (discount > 0) baseline.vouchers.find(row => payload.discount_voucher_ids?.includes(String(row.qr_token)))!.status = "RESERVED";
      if (mode === "bad-unused" && item.product_voucher_id && payload.discount_voucher_ids?.length) {
        baseline.vouchers.find(row => row.id === "discount")!.status = "RESERVED";
      }
      return { ok: true, status: 201, body: { data: stored } };
    }
    const stored = orders.get(path.split("/").at(-1)!);
    if (options.method === "PATCH" && (stored?.discountVouchers as Array<{ voucher_id: string }> | undefined)?.some(link => link.voucher_id === "percent")) {
      if (variantFailure === "cancel-rejected") { writes.push("PATCH"); return { ok: false, status: 400, body: { code: "INVALID_TRANSITION" } }; }
      if (variantFailure === "cancel-ambiguous") { writes.push("PATCH"); throw new AmbiguousMutation("lost"); }
    }
    if (options.method === "PATCH") { writes.push("PATCH"); if (stored) stored.status = "CANCELLED";
      for (const voucher of baseline.vouchers) voucher.status = "ACTIVE"; }
    return { ok: true, status: 200, body: { data: stored } };
  } };
  const ctx = { runId: "run_12345678", runDir: "unused", origin: "https://test.invalid", credential: {},
    customerState: { ...baseline, orders: [] }, catalog: { ...catalog, fingerprint: "catalog" },
    journal: { recordIntent(_type: string, _id: string, recovery: Record<string, unknown>) { intents.push(recovery); }, recordOutcome() {} },
    runState: { addMarker() {}, addSession() {}, addVoucher() {} },
    pacer: { async reserve(...args: unknown[]) { reservations.push(args); } },
    actorLifecycle: { async login() { return { api }; }, async logout() { writes.push("logout"); } },
    db: { async actorState() { return structuredClone(baseline); }, async catalog() { return { fingerprint: "catalog" }; },
      async ordersByMarkers(markers: string[]) { return [...orders.values()].filter(order => markers.includes(order.note as string)
        && !(mode === "missing-audit" && order.status === "CANCELLED")); },
      async vouchers(ids: string[]) { return structuredClone(baseline.vouchers.filter(voucher => ids.includes(String(voucher.id)))); },
      async activeUses(ids: string[]) { return [...orders.values()].filter(order => order.status === "PENDING"
        && ((order.items as Array<Record<string, unknown>>).some(item => ids.includes(String(item.item_voucher_id))
          || ids.includes(String(item.product_voucher_id)))
          || (order.discountVouchers as Array<{ voucher_id: string }>).some(link => ids.includes(link.voucher_id)))); },
      async order(id: string) { return orders.get(id); } },
  };
  if (mode === "variants") {
    ctx.catalog = structuredClone(ctx.catalog);
    ctx.catalog.items[0].sizes.push({ size: "MEDIUM", base_price_vnd: 20_000 });
    ctx.catalog.defaults.push({ size: "MEDIUM", powder_gram: 3, milk_ml: 100 });
  }
  return { ctx, orders, writes, reservations, submitted, baseline };
}

describe("Full staging public orchestration", () => {
  it.each(["cancel-rejected", "cancel-ambiguous"])("cancel subtype lỗi %s giữ pending và session, không retry hay ghi subtype sau", async failure => {
    const test = fullBoundary("variants", failure);
    if (failure === "cancel-ambiguous") await expect(runFullJourney(test.ctx)).rejects.toMatchObject({ code: "MUTATION_OUTCOME_AMBIGUOUS" });
    else expect(await runFullJourney(test.ctx)).toMatchObject({ status: "FAIL", recoveryRequired: true, code: "FULL_CANCEL_RECOVERY_REQUIRED" });
    expect(test.writes).not.toContain("logout");
    expect(test.writes.at(-1)).toBe("PATCH");
    expect(test.writes.filter(write => write === "PATCH")).toHaveLength(6);
    const pending = [...test.orders.values()].filter(order => order.status === "PENDING");
    expect(pending).toHaveLength(1);
    expect(pending[0].discountVouchers).toEqual([{ voucher_id: "percent" }]);
    expect(test.submitted.filter(body => String(body.note).includes("discount-percent"))).toHaveLength(1);
    expect(test.submitted.filter(body => String(body.note).includes("pd-pay-as-size"))).toHaveLength(0);
  });
  it("subtype chỉ PASS sau hai vòng; quota ở reuse giữ PARTIAL và audit hủy vòng đầu", async () => {
    const test = fullBoundary("variants", "percent-reuse-quota");
    const result = await runFullJourney(test.ctx);
    expect(result.cases).toContainEqual({ id: "voucher-discount-percent", status: "PARTIAL", code: "SMOKE_ORDER_RATE_LIMITED" });
    expect(result.cases.filter(row => row.id === "voucher-discount-percent")).toHaveLength(1);
    expect([...test.orders.values()].every(order => order.status === "CANCELLED")).toBe(true);
    expect(test.baseline.vouchers.every(voucher => voucher.status === "ACTIVE")).toBe(true);
  });
  it("mất response ở subtype reuse dừng toàn bộ writes và không logout", async () => {
    const test = fullBoundary("variants", "percent-reuse-ambiguous");
    await expect(runFullJourney(test.ctx)).rejects.toMatchObject({ code: "MUTATION_OUTCOME_AMBIGUOUS" });
    expect(test.writes.at(-1)).toBe("POST");
    expect(test.writes).not.toContain("logout");
    expect(test.submitted.filter(body => String(body.note).includes("pd-pay-as-size"))).toHaveLength(0);
  });
  it("giữ nguyên plan và ngân sách; subtype bổ sung dùng inventory ngoài voucher base đã chọn", async () => {
    const test = fullBoundary("variants");
    const plan = { internal: { coverage: { budgetOk: true, pointsNeeded: 0, selected: [
      { type: "DISCOUNT", source: "existing", voucher: { id: "discount" } },
      { type: "PRODUCT_DISCOUNT", source: "existing", voucher: { id: "fixed-product" } },
    ] } } };
    const initialPlan = structuredClone(plan);
    const initialAssets = structuredClone(test.baseline);
    const result = await runFullJourney({ ...test.ctx, plan });
    expect(result.summary).toMatchObject({ ordersCreated: 9, vouchersAcquired: 0, pointsSpent: 0 });
    expect(plan).toEqual(initialPlan);
    expect(test.baseline).toEqual(initialAssets);
    expect(test.reservations).toEqual([["customer", 1, 60_000], ["customer", 1, 60_000],
      ["customer", 2, 120_000], ["customer", 2, 120_000], ["customer", 2, 120_000], ["customer", 2, 120_000]]);
  });
  it("subtype không có sẵn trả gap dữ liệu thật không đổi voucher khác", async () => {
    const test = fullBoundary("variants");
    test.baseline.vouchers.splice(1, 1);
    const result = await runFullJourney(test.ctx);
    expect(result.cases).toContainEqual({ id: "voucher-discount-percent", status: "PARTIAL", code: "FULL_EXISTING_VARIANT_MISSING" });
    expect(result.summary).toMatchObject({ vouchersAcquired: 0, pointsSpent: 0 });
    expect(test.writes).not.toContain("exchange");
  });
  it("bỏ voucher subtype đã hết hạn và dùng bản còn hiệu lực trong inventory ban đầu", async () => {
    const test = fullBoundary("variants");
    test.baseline.vouchers.splice(1, 0, { ...test.baseline.vouchers[1], id: "expired-percent", qr_token: "expired-token", expires_at: "2000-01-01T00:00:00Z" });
    expect((await runFullJourney(test.ctx)).cases).toContainEqual({ id: "voucher-discount-percent", status: "PASS" });
  });
  it("không retry subtype base bị quota trong vòng subtype bổ sung", async () => {
    const test = fullBoundary("variants", "fixed-quota");
    const result = await runFullJourney(test.ctx);
    expect(result.status).toBe("PARTIAL");
    expect(test.submitted.filter(body => (body.discount_voucher_ids as string[])?.includes("discount-token"))).toHaveLength(1);
    expect(result.cases).not.toContainEqual({ id: "voucher-discount-fixed", status: "PASS" });
  });
  it("thực thi FIXED_AMOUNT và PAY_AS_SIZE sẵn trong ví qua hai vòng thực tế mỗi subtype", async () => {
    const test = fullBoundary("variants");
    const result = await runFullJourney(test.ctx);
    for (const id of ["voucher-product-discount-reuse", "voucher-product-discount-fixed-amount", "voucher-product-discount-pay-as-size"]) {
      expect(result.cases).toContainEqual({ id, status: "PASS" });
    }
    const paySizeOrders = [...test.orders.values()].filter(order => (order.items as Array<Record<string, unknown>>).some(item => item.product_voucher_id === "pay-size"));
    expect(paySizeOrders).toHaveLength(2);
    expect(paySizeOrders.every(order => order.status === "CANCELLED" && order.subtotal_vnd === 27_000 && order.total_vnd === 17_000)).toBe(true);
    expect(result.summary).toMatchObject({ ordersCreated: 9, vouchersAcquired: 0, pointsSpent: 0 });
    expect(test.writes).not.toContain("exchange");
  });
  it("thực thi cả FIXED và PERCENT sẵn trong ví, mỗi loại create cancel reuse không exchange", async () => {
    const test = fullBoundary("variants");
    const result = await runFullJourney(test.ctx);
    expect(result.cases).toContainEqual({ id: "voucher-discount-fixed", status: "PASS" });
    expect(result.cases).toContainEqual({ id: "voucher-discount-percent", status: "PASS" });
    const percentOrders = [...test.orders.values()].filter(order => (order.discountVouchers as Array<{voucher_id: string}>).some(link => link.voucher_id === "percent"));
    expect(percentOrders).toHaveLength(2);
    expect(percentOrders.every(order => order.status === "CANCELLED" && order.total_vnd === 25_000)).toBe(true);
    expect(test.writes).not.toContain("exchange");
  });
  it("dùng lần reuse PRODUCT để chứng minh DISCOUNT không lợi ích không bị giữ hoặc tiêu", async () => {
    const { ctx, orders, submitted } = fullBoundary("no-benefit");
    const result = await runFullJourney(ctx);
    expect(result.cases).toContainEqual({ id: "voucher-no-benefit-not-consumed", status: "PASS" });
    expect(result.summary?.ordersCreated).toBe(5);
    const reused = [...orders.values()].find(order => String(order.note).includes(":product-reuse]"));
    expect(reused).toMatchObject({ status: "CANCELLED", total_vnd: 0, total_voucher_discount_vnd: 0, discountVouchers: [] });
    expect(submitted.find(body => String(body.note).includes(":product-reuse]"))).toMatchObject({
      discount_voucher_ids: ["discount-token"], items: [expect.objectContaining({ product_voucher_id: "product-token", client_price_vnd: 0 })] });
  });
  it("FAIL nếu voucher không lợi ích bị reserve dù cleanup sau đó trả ACTIVE", async () => {
    const { ctx, orders } = fullBoundary("bad-unused");
    expect(await runFullJourney(ctx)).toMatchObject({ status: "FAIL", code: "FULL_NO_BENEFIT_VOUCHER_CONSUMED" });
    expect([...orders.values()].every(order => order.status === "CANCELLED")).toBe(true);
  });
  it("không nhận cleanup ownership cho marker có sẵn ở cycle hoặc wrong-price", async () => {
    for (const caseId of ["price-latte-small", "wrong-client-price"]) {
      const { ctx, orders } = fullBoundary();
      const original = { id: "preexisting", status: "PENDING", user_id: "customer", note: `[STAGING:run_12345678:${caseId}]` };
      orders.set(original.id, structuredClone(original));
      expect(await runFullJourney(ctx)).toMatchObject({ status: "FAIL" });
      expect(orders.get(original.id)).toEqual(original);
    }
  });
  it("acquires a supported PRODUCT package once with a recoverable initial-points baseline", async () => {
    const state = { user: { points_balance: 100 }, vouchers: [] as Array<Record<string, unknown>>, ledger: [] as Array<Record<string, unknown>> };
    const intents: Array<Record<string, unknown>> = [];
    const result = acquireSmokeDiscount({ actorName: "customerB", userId: "customer", voucherType: "PRODUCT",
      plan: { internal: { coverage: { selected: [{ type: "PRODUCT", source: "exchange", package: { id: "p", points_cost: 10 } }] } } },
      db: { async actorState() { return structuredClone(state); } },
      journal: { recordIntent(_type: string, _id: string, data: Record<string, unknown>) { intents.push(data); }, recordOutcome() {} },
      actor: { api: { async request(path: string) {
        if (path.includes("exchange")) {
          state.user.points_balance = 90;
          state.vouchers.push({ id: "v", qr_token: "token", voucher_type: "PRODUCT", package_id: "p", status: "ACTIVE" });
          state.ledger.push({ id: "log", reason: "voucher_purchase", voucher_id: "v", delta: -10 });
          return { ok: true, status: 201, body: { data: { qr_token: "token" } } };
        }
        return { status: 200, body: { data: state.vouchers, meta: { has_more: false } } };
      } } },
    });
    await expect(result).resolves.toMatchObject({ exchanged: true, voucher: { id: "v", voucher_type: "PRODUCT" } });
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ packageId: "p", baselinePoints: 100 });
  });
  it("reports missing size/type capabilities as PARTIAL while proving available cases and wrong-price rollback", async () => {
    const { ctx, orders, reservations } = fullBoundary();
    const result = await runFullJourney(ctx);
    expect(result.status).toBe("PARTIAL");
    expect(result.cases).toContainEqual({ id: "wrong-client-price", status: "PASS" });
    expect(result.gaps.some(item => item.id === "voucher-bundle-reuse")).toBe(false);
    expect(result.gaps).toContainEqual({ id: "voucher-product-discount-pay-as-size", status: "PARTIAL", code: "FULL_EXISTING_VARIANT_MISSING" });
    expect([...orders.values()].map(order => order.status)).toEqual(["CANCELLED"]);
    const [matrix] = [...orders.values()] as Array<{ items: Array<{ note: string }> }>;
    expect(matrix.items).toHaveLength(3);
    expect(new Set(matrix.items.map(item => item.note)).size).toBe(3);
    expect(reservations).toEqual([["customer", 1, 60_000], ["customer", 1, 60_000]]);
  });
  it("exchanges only the planned eligible ITEM, reuses it, and reconciles the immutable purchase", async () => {
    const { ctx, writes } = fullBoundary("exchange");
    const result = await runFullJourney({ ...ctx, plan: { internal: { coverage: { budgetOk: true, pointsNeeded: 10,
      selected: [{ type: "ITEM", source: "exchange", package: { id: "package", points_cost: 10, menu_item_id: "extra" } }] } } } });
    expect(result).toMatchObject({ status: "PARTIAL", summary: { vouchersAcquired: 1, pointsSpent: 10, ordersCreated: 3 } });
    expect(result.cases).toContainEqual({ id: "voucher-item-reuse", status: "PASS" });
    expect(writes.filter(write => write === "exchange")).toHaveLength(1);
  });
  it("does not purchase a package whose target configuration is unavailable", async () => {
    const { ctx, writes } = fullBoundary("exchange");
    const result = await runFullJourney({ ...ctx, plan: { internal: { coverage: { budgetOk: true, pointsNeeded: 10,
      selected: [{ type: "ITEM", source: "exchange", package: { id: "package", points_cost: 10, menu_item_id: "missing" } }] } } } });
    expect(result.status).toBe("PARTIAL");
    expect(writes).not.toContain("exchange");
  });
  it("fails a wrong API gross total and cancels the exact known order", async () => {
    const { ctx, orders } = fullBoundary("bad-total");
    expect(await runFullJourney(ctx)).toMatchObject({ status: "FAIL", code: "SMOKE_CREATE_TOTAL_SUBTOTAL_VND" });
    expect([...orders.values()].map(order => order.status)).toEqual(["CANCELLED"]);
  });
  it("treats unexpected PRICE_CHANGED against an unchanged frozen catalog as FAIL", async () => {
    const { ctx } = fullBoundary("price-changed");
    expect(await runFullJourney(ctx)).toMatchObject({ status: "FAIL", code: "UNEXPECTED_PRICE_CHANGED" });
  });
  it("fails actual catalog drift rather than classifying it as a coverage gap", async () => {
    const { ctx } = fullBoundary("price-changed");
    ctx.db.catalog = async () => ({ fingerprint: "changed" });
    expect(await runFullJourney(ctx)).toMatchObject({ status: "FAIL", code: "CATALOG_CHANGED" });
  });
  it("requires retained exact audit rows for every successfully created and cancelled order", async () => {
    const { ctx } = fullBoundary("missing-audit");
    expect(await runFullJourney(ctx)).toMatchObject({ status: "FAIL", code: "FULL_TERMINAL_AUDIT_MISSING" });
  });
  it("fails a corrupt line snapshot even when all order totals agree", async () => {
    const { ctx, orders } = fullBoundary("bad-line");
    expect(await runFullJourney(ctx)).toMatchObject({ status: "FAIL", code: "FULL_LINE_SNAPSHOT_INVALID" });
    expect([...orders.values()].map(order => order.status)).toEqual(["CANCELLED"]);
  });
  it("never retries an ambiguous create or sends further writes", async () => {
    const { ctx, writes } = fullBoundary("ambiguous");
    await expect(runFullJourney(ctx)).rejects.toMatchObject({ status: "FAIL", code: "MUTATION_OUTCOME_AMBIGUOUS" });
    expect(writes).toEqual(["POST"]);
  });
});
