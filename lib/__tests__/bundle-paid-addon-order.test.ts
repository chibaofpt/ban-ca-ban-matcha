import { beforeEach, describe, expect, it } from "vitest";
import { calcOrderTotals } from "@/lib/orderCalculator";
import { resolveOrderBundles, type OrderBundleDatabase } from "@/lib/orderBundle";
import { processOrderItems, type OrderItemInput } from "@/lib/orders";

const POWDER_ID = "11111111-1111-4111-8111-111111111111";
const MILK_ID = "22222222-2222-4222-8222-222222222222";
const DRINK_ID = "33333333-3333-4333-8333-333333333333";
const EXTRA_ID = "44444444-4444-4444-8444-444444444444";
const ADDON_GIFT_ID = "55555555-5555-4555-8555-555555555555";
const ADDON_PAID_ID = "66666666-6666-4666-8666-666666666666";
const BUNDLE_TOKEN = "77777777-7777-4777-8777-777777777777";
const LINE_ONE = "88888888-8888-4888-8888-888888888888";
const LINE_TWO = "99999999-9999-4999-8999-999999999999";
const LINE_THREE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type QueryTrace = Record<string, number>;

interface Fixture {
  pricingClient: Parameters<typeof processOrderItems>[1];
  bundleDb: OrderBundleDatabase;
  trace: QueryTrace;
}

function readWhereId(args: unknown): string | undefined {
  if (typeof args !== "object" || args === null) return undefined;
  const where = (args as { where?: unknown }).where;
  if (typeof where !== "object" || where === null) return undefined;
  const id = (where as { id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}

function addTrace(trace: QueryTrace, name: string): void {
  trace[name] = (trace[name] ?? 0) + 1;
}

function makeFixture(): Fixture {
  const trace: QueryTrace = {};
  const drinkForPricing = {
    id: DRINK_ID,
    name: "Matcha drink",
    category: "latte",
    is_available: true,
    unit_price_vnd: null,
    matcha_powder_id: POWDER_ID,
    default_powder_id: null,
    default_base_liquid_id: null,
    custom_powder_grams: null,
    sizes: [{ size: "SMALL", base_price_vnd: 40_000, base_liquid_ml: 0 }],
    fusionAllowedPowders: [],
    allowedBaseLiquids: [{ base_liquid_id: MILK_ID, baseLiquid: { is_active: true } }],
  };
  const extraForPricing = {
    id: EXTRA_ID,
    name: "Gift topping",
    category: "extras",
    is_available: true,
    unit_price_vnd: 20_000,
    matcha_powder_id: null,
    default_powder_id: null,
    default_base_liquid_id: null,
    custom_powder_grams: null,
    sizes: [],
    fusionAllowedPowders: [],
    allowedBaseLiquids: [],
  };
  const addonById = {
    [ADDON_GIFT_ID]: {
      id: ADDON_GIFT_ID,
      is_active: true,
      price_vnd: 5_000,
      gram_value: null,
      group: { id: "addon-group", is_active: true, max_select: 2, is_dynamic_gram: false },
    },
    [ADDON_PAID_ID]: {
      id: ADDON_PAID_ID,
      is_active: true,
      price_vnd: 7_000,
      gram_value: null,
      group: { id: "addon-group", is_active: true, max_select: 2, is_dynamic_gram: false },
    },
  };
  const pricingClient = {
    defaultSizeConfig: {
      findMany: async () => {
        addTrace(trace, "pricing.defaultSizeConfig.findMany");
        return [{ size: "SMALL", milk_ml: 0, powder_gram: 0 }];
      },
    },
    powderSizeConfig: {
      findMany: async () => {
        addTrace(trace, "pricing.powderSizeConfig.findMany");
        return [];
      },
    },
    matchaPowder: {
      findMany: async () => {
        addTrace(trace, "pricing.matchaPowder.findMany");
        return [{ id: POWDER_ID, name: "Meyumi", price_per_gram: 0, is_available: true, reference_latte_item_id: null }];
      },
    },
    milkType: {
      findMany: async () => {
        addTrace(trace, "pricing.milkType.findMany");
        return [{ id: MILK_ID, price_per_ml: 0, is_active: true, is_default: true, display_order: 0 }];
      },
    },
    menuItemSize: {
      findMany: async () => {
        addTrace(trace, "pricing.menuItemSize.findMany");
        return [];
      },
      findFirst: async () => null,
    },
    menuItem: {
      findUnique: async (args: unknown) => {
        addTrace(trace, "pricing.menuItem.findUnique");
        const id = readWhereId(args);
        return id === DRINK_ID ? drinkForPricing : id === EXTRA_ID ? extraForPricing : null;
      },
    },
    addonOption: {
      findUnique: async (args: unknown) => {
        addTrace(trace, "pricing.addonOption.findUnique");
        const id = readWhereId(args);
        return id === ADDON_GIFT_ID ? addonById[ADDON_GIFT_ID] : id === ADDON_PAID_ID ? addonById[ADDON_PAID_ID] : null;
      },
    },
  } as unknown as Parameters<typeof processOrderItems>[1];

  const bundleVoucher = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    qr_token: BUNDLE_TOKEN,
    user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    voucher_type: "BUNDLE",
    status: "ACTIVE",
    expires_at: new Date("2026-12-31T00:00:00.000Z"),
    package: {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      ends_at: new Date("2026-12-31T00:00:00.000Z"),
      min_order_vnd: null,
      bundleRule: {
        buy_quantity: 2,
        reward_quantity: 1,
        reward_kind: "PRODUCT",
        reward_mode: "FIXED_CONFIG",
        benefit_scaling: "PER_BUNDLE",
        max_applications_order: 1,
        max_reward_units_order: null,
        productScopes: [
          { role: "QUALIFIER", menu_item_id: DRINK_ID, default_powder_id: POWDER_ID, default_base_liquid_id: MILK_ID, sizes: [{ size: "SMALL" }] },
          { role: "REWARD", menu_item_id: EXTRA_ID, default_powder_id: null, default_base_liquid_id: null, sizes: [] },
        ],
        addonRewards: [],
      },
    },
  };
  const bundleDb = {
    defaultSizeConfig: {
      findMany: async () => [{ size: "SMALL", milk_ml: 0, powder_gram: 0 }],
    },
    powderSizeConfig: { findMany: async () => [] },
    menuItemSize: { findMany: async () => [] },
    voucher: {
      findMany: async () => {
        addTrace(trace, "bundle.voucher.findMany");
        return [bundleVoucher];
      },
    },
    menuItem: {
      findMany: async () => {
        addTrace(trace, "bundle.menuItem.findMany");
        return [
          {
            id: DRINK_ID,
            name: drinkForPricing.name,
            category: drinkForPricing.category,
            is_available: true,
            unit_price_vnd: null,
            matcha_powder_id: POWDER_ID,
            default_powder_id: null,
            default_base_liquid_id: null,
            sizes: [{ size: "SMALL", base_price_vnd: 40_000 }],
            allowedBaseLiquids: [{ base_liquid_id: MILK_ID }],
          },
          {
            id: EXTRA_ID,
            name: extraForPricing.name,
            category: extraForPricing.category,
            is_available: true,
            unit_price_vnd: 20_000,
            matcha_powder_id: null,
            default_powder_id: null,
            default_base_liquid_id: null,
            sizes: [],
            allowedBaseLiquids: [],
          },
        ];
      },
    },
    matchaPowder: {
      findMany: async () => {
        addTrace(trace, "bundle.matchaPowder.findMany");
        return [{ id: POWDER_ID, name: "Meyumi", price_per_gram: 0, is_available: true }];
      },
    },
    milkType: {
      findMany: async () => {
        addTrace(trace, "bundle.milkType.findMany");
        return [{ id: MILK_ID, is_active: true, is_default: true, display_order: 0 }];
      },
    },
    addonOption: {
      findMany: async () => {
        addTrace(trace, "bundle.addonOption.findMany");
        return [ADDON_GIFT_ID, ADDON_PAID_ID].map((id) => ({ id, is_active: true, gram_value: null, group: { is_active: true } }));
      },
    },
  } as unknown as OrderBundleDatabase;

  return { pricingClient, bundleDb, trace };
}

function drinkInput(clientPrice: number, addonOptionIds: string[] = []): OrderItemInput {
  return {
    menu_item_id: DRINK_ID,
    quantity: 1,
    size: "SMALL",
    sweetness: "FULL",
    ice_option: "NORMAL",
    addon_option_ids: addonOptionIds,
    client_price_vnd: clientPrice,
  };
}

function extraInput(): OrderItemInput {
  return {
    menu_item_id: EXTRA_ID,
    quantity: 1,
    size: null,
    sweetness: "FULL",
    ice_option: "NORMAL",
    addon_option_ids: [],
    client_price_vnd: 20_000,
  };
}

describe("checkout BUNDLE PRODUCT extras với addon trả tiền", () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = makeFixture();
  });

  it("chạy xuyên resolver giá, BUNDLE và tổng đơn giao hàng ba dòng", async () => {
    const inputItems = [drinkInput(40_000), drinkInput(47_000, [ADDON_PAID_ID]), extraInput()];
    const resolvedItems = await processOrderItems(inputItems, fixture.pricingClient);

    expect(resolvedItems).toMatchObject([
      { unit_price_vnd: 40_000, addons_price_vnd: 0, line_total: 40_000 },
      { unit_price_vnd: 40_000, addons_price_vnd: 7_000, line_total: 47_000 },
      { unit_price_vnd: 20_000, addons_price_vnd: 0, line_total: 20_000 },
    ]);
    expect(resolvedItems[1]?.resolvedAddons).toEqual([
      { addon_option_id: ADDON_PAID_ID, quantity: 1, unit_price_vnd: 7_000, gram_value: null, discount_applied_vnd: 0 },
    ]);

    const bundles = await resolveOrderBundles(fixture.bundleDb, {
      voucher_owner_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      now: new Date("2026-09-08T00:00:00.000Z"),
      items: [
        { client_line_id: LINE_ONE, addon_voucher_ids: [] },
        { client_line_id: LINE_TWO, addon_voucher_ids: [] },
        { client_line_id: LINE_THREE, addon_voucher_ids: [] },
      ],
      resolved_items: resolvedItems,
      bundle_applications: [{
        voucher_qr_token: BUNDLE_TOKEN,
        qualifier_allocations: [
          { client_line_id: LINE_ONE, quantity: 1 },
          { client_line_id: LINE_TWO, quantity: 1 },
        ],
        reward_allocations: [{ client_line_id: LINE_THREE, quantity: 1 }],
      }],
    });

    expect(bundles.line_discounts_vnd).toEqual([0, 0, 20_000]);
    expect(bundles.bundles[0]?.evaluation).toEqual({
      application_count: 1,
      total_discount_vnd: 20_000,
      rewards: [{ client_line_id: LINE_THREE, addon_option_id: null, quantity: 1, discount_vnd: 20_000 }],
    });

    const calculation = calcOrderTotals({
      items: resolvedItems.map((item, index) => ({
        menu_item_id: item.menu_item_id,
        unit_price_vnd: item.unit_price_vnd,
        addons_price_vnd: item.addons_price_vnd,
        quantity: item.quantity,
        line_total: item.line_total,
        bundle_discount_vnd: bundles.line_discounts_vnd[index] ?? 0,
        product_voucher_id: null,
        product_voucher_covered_vnd: 0,
        addon_vouchers: [],
      })),
      discountVouchers: [],
      freeshipVoucher: null,
      shipping_fee_vnd: 30_000,
    });

    expect(calculation.subtotal_vnd).toBe(107_000);
    expect(calculation.items_discount_vnd).toBe(20_000);
    expect(calculation.total_vnd).toBe(87_000);
    expect(calculation.grand_total_vnd).toBe(117_000);
    console.info("bundle paid-addon fixture query trace", fixture.trace);
  });
});
