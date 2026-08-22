/**
 * Unit tests for lib/orders.ts â€” processOrderItems core logic.
 *
 * Strategy: mock lib/pricing vÃ  lib/prisma Ä‘á»ƒ test thuáº§n JS,
 * khÃ´ng cáº§n káº¿t ná»‘i DB tháº­t.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

// â”€â”€ Mock lib/prisma (prevent PrismaClient instantiation) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    menuItem: { findUnique: vi.fn() },
    addonOption: { findUnique: vi.fn() },
  },
}));

// â”€â”€ Mock lib/pricing â€” return controlled values â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const mockBuildPricingContext = vi.fn();
const mockResolveOrderItemPrice = vi.fn();
const mockResolveOrderItemPremiumLatte = vi.fn();
const mockResolveOrderItemBaseLiquidMl = vi.fn();

vi.mock("@/lib/pricing", () => ({
  buildPricingContext: (...args: unknown[]) => mockBuildPricingContext(...args),
  resolveOrderItemPrice: (...args: unknown[]) => mockResolveOrderItemPrice(...args),
  resolveOrderItemPremiumLatte: (...args: unknown[]) => mockResolveOrderItemPremiumLatte(...args),
  resolveOrderItemBaseLiquidMl: (...args: unknown[]) => mockResolveOrderItemBaseLiquidMl(...args),
}));

// â”€â”€ Import after mocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import {
  processOrderItems,
  OrderValidationError,
  PriceChangedError,
  type OrderItemInput,
} from "@/lib/orders";

// â”€â”€ Shared fixtures â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const POWDER_ID = "powder-aaa";
const MILK_ID = "milk-bbb";
const MENU_ITEM_ID = "item-latte-ccc";
const FUSION_ITEM_ID = "item-fusion-ddd";
const ADDON_KEM_ID = "addon-kem-eee";
const ADDON_EXTRA_MATCHA_ID = "addon-extra-fff";

// â”€â”€ Fusion powder IDs â€” khai bÃ¡o sá»›m Ä‘á»ƒ dÃ¹ng trong basePricingCtx â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FUSION_DEFAULT_POWDER = "powder-default-fusion";
const FUSION_ALLOWED_POWDER = "powder-allowed-fusion";

/** Minimal PricingContext â€” bao gá»“m táº¥t cáº£ powders dÃ¹ng trong tests */
const basePricingCtx = {
  defaultSizeConfigs: [
    { size: "SMALL" as const, milk_ml: 130, powder_gram: 3.5 },
    { size: "MEDIUM" as const, milk_ml: 200, powder_gram: 4.5 },
    { size: "LARGE" as const, milk_ml: 300, powder_gram: 8.0 },
  ],
  powderPriceMap: {
    [POWDER_ID]: 6000,
    [FUSION_DEFAULT_POWDER]: 5000,
    [FUSION_ALLOWED_POWDER]: 7000,
  },
  powderSizeConfigMap: {},
  defaultMilkPricePerMl: 40,
  defaultBaseLiquidId: MILK_ID,
  milkPriceMap: { [MILK_ID]: 40 },
  // Required by fusion fallback logic in lib/orders.ts L219
  availablePowders: [
    { id: POWDER_ID, name: "Meyumi" },
    { id: FUSION_DEFAULT_POWDER, name: "Fusion Default" },
    { id: FUSION_ALLOWED_POWDER, name: "Fusion Allowed" },
  ],
};

/** Táº¡o mock tx object â€” override tá»«ng method cho tá»«ng test */
function makeTx(overrides: {
  menuItemResult?: object | null;
  addonResults?: Record<string, object | null>;
}) {
  return {
    menuItem: {
      findUnique: vi.fn().mockResolvedValue(overrides.menuItemResult ?? null),
    },
    addonOption: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        const result = overrides.addonResults?.[where.id] ?? null;
        if (!result || "group" in result) return Promise.resolve(result);
        return Promise.resolve({
          ...result,
          is_active: true,
          group: {
            id: "group-default",
            type: "TOGGLE",
            is_active: true,
            max_quantity: null,
            options: [{ id: where.id, is_active: true }],
          },
        });
      }),
    },
  };
}

/** Latte menu item máº«u */
const latteMenuItem = {
  id: MENU_ITEM_ID,
  name: "TrÃ  Xanh Sá»¯a",
  category: "latte",
  is_available: true,
  matcha_powder_id: POWDER_ID,
  default_powder_id: null,
  custom_powder_grams: null,
  default_base_liquid_id: null,
  allowedBaseLiquids: [],
  fusionAllowedPowders: [],
  sizes: [
    { size: "SMALL", base_price_vnd: 45000 },
    { size: "MEDIUM", base_price_vnd: 55000 },
    { size: "LARGE", base_price_vnd: 65000 },
  ],
};

/** Fusion menu item máº«u */
const fusionMenuItem = {
  id: FUSION_ITEM_ID,
  name: "Matcha Cam",
  category: "fusion",
  is_available: true,
  matcha_powder_id: null,
  default_powder_id: FUSION_DEFAULT_POWDER,
  custom_powder_grams: null,
  default_base_liquid_id: null,
  allowedBaseLiquids: [],
  // matchaPowder.is_available required by fusion powder filter in lib/orders.ts L238
  fusionAllowedPowders: [
    { powder_id: FUSION_ALLOWED_POWDER, matchaPowder: { is_available: true } },
  ],
  sizes: [
    { size: "SMALL", base_price_vnd: 50000 },
    { size: "MEDIUM", base_price_vnd: 60000 },
  ],
};

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("processOrderItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildPricingContext.mockResolvedValue(basePricingCtx);
    mockResolveOrderItemPremiumLatte.mockResolvedValue(0);
    mockResolveOrderItemBaseLiquidMl.mockImplementation(
      (overrideMl: number | null | undefined, _size: string, ctx: typeof basePricingCtx) =>
        overrideMl ?? ctx.defaultSizeConfigs.find((entry) => entry.size === "MEDIUM")?.milk_ml ?? 0,
    );
  });

  // â”€â”€ Happy path â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("returns processed item when price matches (Latte, no addons)", async () => {
    const SERVER_PRICE = 69000;
    mockResolveOrderItemPrice.mockReturnValue(SERVER_PRICE);

    const tx = makeTx({ menuItemResult: latteMenuItem });
    const input: OrderItemInput[] = [
      {
        menu_item_id: MENU_ITEM_ID,
        quantity: 2,
        size: "MEDIUM",
        sweetness: "QUARTER",
        addon_option_ids: [],
        client_price_vnd: SERVER_PRICE,
      },
    ];

    const result = await processOrderItems(input, tx as never);

    expect(result).toHaveLength(1);
    expect(result[0].unit_price_vnd).toBe(SERVER_PRICE);
    expect(result[0].addons_price_vnd).toBe(0);
    expect(result[0].product_voucher_discount_vnd).toBe(0);
    expect(result[0].total_discount_vnd).toBe(0);
    expect(result[0].line_total).toBe(SERVER_PRICE * 2);
    expect(result[0].selected_powder_id).toBe(POWDER_ID); // Latte: auto-set
    expect(result[0].base_liquid_ml).toBe(200);
    expect(result[0].ice_option).toBe("NORMAL"); // default
    expect(result[0].coldwhisk).toBe(false); // default
  });

  it("sets ice_option and coldwhisk when provided", async () => {
    mockResolveOrderItemPrice.mockReturnValue(55000);
    const tx = makeTx({ menuItemResult: latteMenuItem });

    const result = await processOrderItems(
      [
        {
          menu_item_id: MENU_ITEM_ID,
          quantity: 1,
          size: "SMALL",
          sweetness: "HALF",
          ice_option: "LESS_ICE",
          coldwhisk: true,
          addon_option_ids: [],
          client_price_vnd: 55000,
        },
      ],
      tx as never
    );

    expect(result[0].ice_option).toBe("LESS_ICE");
    expect(result[0].coldwhisk).toBe(true);
  });

  it("Latte: ignores client-sent selected_powder_id and uses matcha_powder_id", async () => {
    mockResolveOrderItemPrice.mockReturnValue(69000);
    const tx = makeTx({ menuItemResult: latteMenuItem });

    const result = await processOrderItems(
      [
        {
          menu_item_id: MENU_ITEM_ID,
          quantity: 1,
          size: "MEDIUM",
          sweetness: "QUARTER",
          selected_powder_id: "some-other-powder-client-sent",
          addon_option_ids: [],
          client_price_vnd: 69000,
        },
      ],
      tx as never
    );

    // Must use matcha_powder_id, not client-sent value
    expect(result[0].selected_powder_id).toBe(POWDER_ID);
  });

  // â”€â”€ Addon pricing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("prices regular addons (kem, Ä‘Ã¡ dá»«a) using price_vnd", async () => {
    mockResolveOrderItemPrice.mockReturnValue(69000);
    const tx = makeTx({
      menuItemResult: latteMenuItem,
      addonResults: {
        [ADDON_KEM_ID]: {
          id: ADDON_KEM_ID,
          price_vnd: 8000,
          gram_value: null, // not extra matcha
        },
      },
    });

    const result = await processOrderItems(
      [
        {
          menu_item_id: MENU_ITEM_ID,
          quantity: 1,
          size: "MEDIUM",
          sweetness: "QUARTER",
          addon_option_ids: [{ option_id: ADDON_KEM_ID, quantity: 1 }],
          client_price_vnd: 77000, // 69000 + 8000
        },
      ],
      tx as never
    );

    expect(result[0].addons_price_vnd).toBe(8000);
    expect(result[0].resolvedAddons[0].unit_price_vnd).toBe(8000);
    expect(result[0].resolvedAddons[0].discount_applied_vnd).toBe(0);
    expect(result[0].total_discount_vnd).toBe(0);
    expect(result[0].line_total).toBe((69000 + 8000) * 1);
  });

  it("prices extra matcha using gram_value Ã— price_per_gram (NOT price_vnd=0)", async () => {
    // This is the bug fix: extra matcha price_vnd=0 but gram_value=2, price_per_gram=6000
    // Expected: 2 Ã— 6000 = 12000, NOT 0
    mockResolveOrderItemPrice.mockReturnValue(69000);
    const tx = makeTx({
      menuItemResult: latteMenuItem,
      addonResults: {
        [ADDON_EXTRA_MATCHA_ID]: {
          id: ADDON_EXTRA_MATCHA_ID,
          price_vnd: 0, // always 0 in DB for extra matcha
          gram_value: new Decimal("2"), // 2 grams
        },
      },
    });

    const result = await processOrderItems(
      [
        {
          menu_item_id: MENU_ITEM_ID,
          quantity: 1,
          size: "MEDIUM",
          sweetness: "QUARTER",
          addon_option_ids: [{ option_id: ADDON_EXTRA_MATCHA_ID, quantity: 1 }],
          client_price_vnd: 81000, // 69000 + 12000
        },
      ],
      tx as never
    );

    // POWDER_ID has price_per_gram = 6000 in basePricingCtx
    expect(result[0].resolvedAddons[0].unit_price_vnd).toBe(12000); // 2g Ã— 6000
    expect(result[0].addons_price_vnd).toBe(12000);
  });

  it("từ chối option Extra Matcha 0g đã inactive", async () => {
    mockResolveOrderItemPrice.mockReturnValue(69000);
    const tx = makeTx({
      menuItemResult: latteMenuItem,
      addonResults: {
        [ADDON_EXTRA_MATCHA_ID]: {
          id: ADDON_EXTRA_MATCHA_ID,
          price_vnd: 0,
          gram_value: new Decimal("0"), // 0g â€” default option
          is_active: false,
          group: {
            id: "group-extra",
            type: "SELECTOR",
            is_active: true,
            max_quantity: null,
            options: [{ id: ADDON_EXTRA_MATCHA_ID, is_active: false }],
          },
        },
      },
    });

    await expect(processOrderItems(
      [{
        menu_item_id: MENU_ITEM_ID,
        quantity: 1,
        size: "MEDIUM",
        sweetness: "QUARTER",
        addon_option_ids: [{ option_id: ADDON_EXTRA_MATCHA_ID, quantity: 1 }],
        client_price_vnd: 69000,
      }],
      tx as never,
    )).rejects.toMatchObject({ name: "OrderValidationError", code: "NOT_FOUND" });
  });

  it("snapshot base_liquid_ml theo override của size tại thời điểm đặt món", async () => {
    mockResolveOrderItemPrice.mockReturnValue(69_000);
    const tx = makeTx({
      menuItemResult: {
        ...latteMenuItem,
        sizes: latteMenuItem.sizes.map((row) =>
          row.size === "MEDIUM" ? { ...row, base_liquid_ml: 245 } : row,
        ),
      },
    });

    const result = await processOrderItems([{
      menu_item_id: MENU_ITEM_ID,
      quantity: 1,
      size: "MEDIUM",
      sweetness: "FULL",
      addon_option_ids: [],
      client_price_vnd: 69_000,
    }], tx as never);

    expect(result[0].base_liquid_ml).toBe(245);
  });

  it("từ chối hai option thuộc cùng SELECTOR", async () => {
    mockResolveOrderItemPrice.mockReturnValue(69_000);
    const group = {
      id: "group-cream",
      type: "SELECTOR",
      is_active: true,
      max_quantity: null,
      options: [{ id: "cream-half", is_active: true }, { id: "cream-one", is_active: true }],
    };
    const tx = makeTx({
      menuItemResult: latteMenuItem,
      addonResults: {
        "cream-half": { id: "cream-half", price_vnd: 20_000, gram_value: null, is_active: true, group },
        "cream-one": { id: "cream-one", price_vnd: 40_000, gram_value: null, is_active: true, group },
      },
    });

    await expect(processOrderItems([{
      menu_item_id: MENU_ITEM_ID,
      quantity: 1,
      size: "MEDIUM",
      sweetness: "FULL",
      addon_option_ids: [
        { option_id: "cream-half", quantity: 1 },
        { option_id: "cream-one", quantity: 1 },
      ],
      client_price_vnd: 129_000,
    }], tx as never)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("từ chối quantity khác 1 cho SELECTOR", async () => {
    mockResolveOrderItemPrice.mockReturnValue(69_000);
    const tx = makeTx({
      menuItemResult: latteMenuItem,
      addonResults: {
        [ADDON_KEM_ID]: {
          id: ADDON_KEM_ID,
          price_vnd: 20_000,
          gram_value: null,
          is_active: true,
          group: {
            id: "group-cream",
            type: "SELECTOR",
            is_active: true,
            max_quantity: null,
            options: [{ id: ADDON_KEM_ID, is_active: true }],
          },
        },
      },
    });

    await expect(processOrderItems([{
      menu_item_id: MENU_ITEM_ID,
      quantity: 1,
      size: "MEDIUM",
      sweetness: "FULL",
      addon_option_ids: [{ option_id: ADDON_KEM_ID, quantity: 2 }],
      client_price_vnd: 109_000,
    }], tx as never)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("PRODUCT voucher â†’ drink discount applied, customer pays diff, addons still charged", async () => {
    mockResolveOrderItemPrice.mockReturnValue(69000);
    const tx = makeTx({
      menuItemResult: latteMenuItem,
      addonResults: {
        [ADDON_KEM_ID]: { id: ADDON_KEM_ID, price_vnd: 8000, gram_value: null },
      },
    });

    // covered_price_vnd = 69000 (exactly the drink price)
    const productVoucherMap = new Map([
      ["voucher-xyz", { menu_item_id: MENU_ITEM_ID, covered_price_vnd: 69000 }],
    ]);

    const result = await processOrderItems(
      [
        {
          menu_item_id: MENU_ITEM_ID,
          quantity: 1,
          size: "MEDIUM",
          sweetness: "QUARTER",
          addon_option_ids: [{ option_id: ADDON_KEM_ID, quantity: 1 }],
          product_voucher_id: "voucher-xyz",
          client_price_vnd: 8000, // 0 (drink fully covered) + 8000 (addon)
        },
      ],
      tx as never,
      productVoucherMap
    );

    expect(result[0].unit_price_vnd).toBe(69000);
    expect(result[0].addons_price_vnd).toBe(8000);
    expect(result[0].product_voucher_discount_vnd).toBe(69000);
    expect(result[0].total_discount_vnd).toBe(69000);
    expect(result[0].line_total).toBe(69000 + 8000);
  });

  it("PRODUCT voucher â†’ partial coverage: customer pays size upgrade diff", async () => {
    mockResolveOrderItemPrice.mockReturnValue(90000); // XL more expensive
    const tx = makeTx({
      menuItemResult: latteMenuItem,
      addonResults: {},
    });

    // covered_price_vnd = 69000 (L size price)
    const productVoucherMap = new Map([
      ["voucher-xyz", { menu_item_id: MENU_ITEM_ID, covered_price_vnd: 69000 }],
    ]);

    const result = await processOrderItems(
      [
        {
          menu_item_id: MENU_ITEM_ID,
          quantity: 1,
          size: "LARGE",
          sweetness: "QUARTER",
          addon_option_ids: [],
          product_voucher_id: "voucher-xyz",
          client_price_vnd: 21000, // 90000 - 69000 = 21000 customer pays
        },
      ],
      tx as never,
      productVoucherMap
    );

    expect(result[0].unit_price_vnd).toBe(90000);
    expect(result[0].product_voucher_discount_vnd).toBe(69000);
    expect(result[0].total_discount_vnd).toBe(69000);
    expect(result[0].line_total).toBe(90000);
  });



  it("ADDON voucher â†’ exact addon discount applied", async () => {
    mockResolveOrderItemPrice.mockReturnValue(69000);
    const tx = makeTx({
      menuItemResult: latteMenuItem,
      addonResults: {
        [ADDON_KEM_ID]: { id: ADDON_KEM_ID, price_vnd: 8000, gram_value: null },
      },
    });

    const addonVoucherMap = new Map([
      ["addon-voucher-123", ADDON_KEM_ID],
    ]);

    const result = await processOrderItems(
      [
        {
          menu_item_id: MENU_ITEM_ID,
          quantity: 1,
          size: "MEDIUM",
          sweetness: "QUARTER",
          addon_option_ids: [{ option_id: ADDON_KEM_ID, quantity: 1 }],
          addon_voucher_ids: [{ voucher_id: "addon-voucher-123", addon_option_id: ADDON_KEM_ID }],
          client_price_vnd: 69000, // 69000 + 8000 - 8000
        },
      ],
      tx as never,
      undefined,
      addonVoucherMap
    );

    expect(result[0].unit_price_vnd).toBe(69000);
    expect(result[0].addons_price_vnd).toBe(8000);
    expect(result[0].resolvedAddons[0].discount_applied_vnd).toBe(8000);
    expect(result[0].product_voucher_discount_vnd).toBe(0);
    expect(result[0].total_discount_vnd).toBe(8000);
    expect(result[0].line_total).toBe(69000 + 8000);
  });

  // â”€â”€ Fusion powder validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("Fusion: accepts default powder without error", async () => {
    mockResolveOrderItemPrice.mockReturnValue(72000);
    const fusionCtx = {
      ...basePricingCtx,
      powderPriceMap: {
        [FUSION_DEFAULT_POWDER]: 5000,
        [FUSION_ALLOWED_POWDER]: 8000,
      },
    };
    mockBuildPricingContext.mockResolvedValue(fusionCtx);

    const tx = makeTx({ menuItemResult: fusionMenuItem });

    const result = await processOrderItems(
      [
        {
          menu_item_id: FUSION_ITEM_ID,
          quantity: 1,
          size: "SMALL",
          sweetness: "QUARTER",
          selected_powder_id: FUSION_DEFAULT_POWDER,
          addon_option_ids: [],
          client_price_vnd: 72000,
        },
      ],
      tx as never
    );

    expect(result[0].selected_powder_id).toBe(FUSION_DEFAULT_POWDER);
  });

  it("Fusion: accepts powder in allowed list", async () => {
    mockResolveOrderItemPrice.mockReturnValue(85000);
    mockResolveOrderItemPremiumLatte.mockResolvedValue(5000);
    const fusionCtx = {
      ...basePricingCtx,
      powderPriceMap: {
        [FUSION_DEFAULT_POWDER]: 5000,
        [FUSION_ALLOWED_POWDER]: 8000,
      },
    };
    mockBuildPricingContext.mockResolvedValue(fusionCtx);

    const tx = makeTx({ menuItemResult: fusionMenuItem });

    const result = await processOrderItems(
      [
        {
          menu_item_id: FUSION_ITEM_ID,
          quantity: 1,
          size: "SMALL",
          sweetness: "QUARTER",
          selected_powder_id: FUSION_ALLOWED_POWDER,
          addon_option_ids: [],
          client_price_vnd: 85000,
        },
      ],
      tx as never
    );

    expect(result[0].selected_powder_id).toBe(FUSION_ALLOWED_POWDER);
    expect(mockResolveOrderItemPremiumLatte).toHaveBeenCalledWith(
      FUSION_ALLOWED_POWDER,
      FUSION_DEFAULT_POWDER,
      "SMALL",
      tx
    );
  });

  it("Fusion dùng cùng fallback powder rẻ nhất và Base Liquid active như menu/BUNDLE", async () => {
    mockResolveOrderItemPrice.mockReturnValue(72_000);
    mockBuildPricingContext.mockResolvedValue({
      ...basePricingCtx,
      defaultBaseLiquidId: MILK_ID,
      powderPriceMap: { "powder-expensive": 9000, "powder-cheap": 3000 },
      availablePowders: [
        { id: "powder-expensive", name: "Khác A" },
        { id: "powder-cheap", name: "Khác B" },
      ],
      milkPriceMap: { "milk-fallback": 45 },
      availableBaseLiquids: [{ id: "milk-fallback", is_active: true, display_order: 1 }],
    });
    const tx = makeTx({ menuItemResult: {
      ...fusionMenuItem,
      default_powder_id: "powder-inactive",
      default_base_liquid_id: "milk-inactive",
      fusionAllowedPowders: [],
      allowedBaseLiquids: [{ base_liquid_id: "milk-fallback", baseLiquid: { is_active: true } }],
    } });
    const result = await processOrderItems([{
      menu_item_id: FUSION_ITEM_ID, quantity: 1, size: "SMALL", sweetness: "QUARTER",
      addon_option_ids: [], client_price_vnd: 72_000,
    }], tx as never);
    expect(result[0]?.selected_powder_id).toBe("powder-cheap");
    expect(result[0]?.selected_milk_type_id).toBe("milk-fallback");
    expect(mockResolveOrderItemPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        powder_id: "powder-cheap",
        base_liquid_id: "milk-fallback",
        default_base_liquid_id: "milk-fallback",
      }),
      expect.anything(),
    );
  });

  it("Fusion: rejects powder not in allowed list â†’ OrderValidationError", async () => {
    const fusionCtx = {
      ...basePricingCtx,
      powderPriceMap: { [FUSION_DEFAULT_POWDER]: 5000 },
    };
    mockBuildPricingContext.mockResolvedValue(fusionCtx);

    const tx = makeTx({ menuItemResult: fusionMenuItem });

    await expect(
      processOrderItems(
        [
          {
            menu_item_id: FUSION_ITEM_ID,
            quantity: 1,
            size: "SMALL",
            sweetness: "QUARTER",
            selected_powder_id: "powder-not-allowed",
            addon_option_ids: [],
            client_price_vnd: 60000,
          },
        ],
        tx as never
      )
    ).rejects.toThrow(OrderValidationError);
  });

  // â”€â”€ PRICE_CHANGED â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("throws PriceChangedError when client_price_vnd != server price", async () => {
    mockResolveOrderItemPrice.mockReturnValue(69000);
    const tx = makeTx({ menuItemResult: latteMenuItem });

    const err = await processOrderItems(
      [
        {
          menu_item_id: MENU_ITEM_ID,
          quantity: 1,
          size: "MEDIUM",
          sweetness: "QUARTER",
          addon_option_ids: [],
          client_price_vnd: 65000, // wrong â€” should be 69000
        },
      ],
      tx as never
    ).catch((e) => e);

    expect(err).toBeInstanceOf(PriceChangedError);
    expect(err.conflicts).toHaveLength(1);
    expect(err.conflicts[0].client_price_vnd).toBe(65000);
    expect(err.conflicts[0].server_price_vnd).toBe(69000);
    expect(err.conflicts[0].menu_item_id).toBe(MENU_ITEM_ID);
  });

  it("collects ALL conflicts before throwing (multi-item order)", async () => {
    mockResolveOrderItemPrice.mockReturnValue(69000);
    const tx = {
      menuItem: {
        findUnique: vi.fn().mockResolvedValue(latteMenuItem),
      },
      addonOption: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    const err = await processOrderItems(
      [
        {
          menu_item_id: MENU_ITEM_ID,
          quantity: 1,
          size: "MEDIUM",
          sweetness: "QUARTER",
          addon_option_ids: [],
          client_price_vnd: 60000, // wrong
        },
        {
          menu_item_id: MENU_ITEM_ID,
          quantity: 2,
          size: "SMALL",
          sweetness: "NONE",
          addon_option_ids: [],
          client_price_vnd: 50000, // also wrong
        },
      ],
      tx as never
    ).catch((e) => e);

    expect(err).toBeInstanceOf(PriceChangedError);
    expect(err.conflicts).toHaveLength(2);
  });

  // â”€â”€ Validation errors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("throws OrderValidationError (VALIDATION_ERROR) when item with voucher has quantity > 1", async () => {
    const tx = makeTx({ menuItemResult: latteMenuItem });

    await expect(
      processOrderItems(
        [
          {
            menu_item_id: MENU_ITEM_ID,
            quantity: 2,
            size: "MEDIUM",
            sweetness: "QUARTER",
            addon_option_ids: [],
            product_voucher_id: "voucher-123",
            client_price_vnd: 69000,
          },
        ],
        tx as never
      )
    ).rejects.toMatchObject({
      name: "OrderValidationError",
      code: "VALIDATION_ERROR",
      message: "Voucher chỉ có thể áp dụng cho 1 sản phẩm. Vui lòng tách sản phẩm ra trước khi áp dụng.",
    });
  });

  it("throws OrderValidationError (NOT_FOUND) when menu item does not exist", async () => {
    const tx = makeTx({ menuItemResult: null });

    await expect(
      processOrderItems(
        [
          {
            menu_item_id: "nonexistent-id",
            quantity: 1,
            size: "MEDIUM",
            sweetness: "QUARTER",
            addon_option_ids: [],
            client_price_vnd: 69000,
          },
        ],
        tx as never
      )
    ).rejects.toMatchObject({ name: "OrderValidationError", code: "NOT_FOUND" });
  });

  it("throws OrderValidationError (NOT_FOUND) when menu item is unavailable", async () => {
    const tx = makeTx({
      menuItemResult: { ...latteMenuItem, is_available: false },
    });

    await expect(
      processOrderItems(
        [
          {
            menu_item_id: MENU_ITEM_ID,
            quantity: 1,
            size: "MEDIUM",
            sweetness: "QUARTER",
            addon_option_ids: [],
            client_price_vnd: 69000,
          },
        ],
        tx as never
      )
    ).rejects.toMatchObject({ name: "OrderValidationError", code: "NOT_FOUND" });
  });

  it("throws OrderValidationError (VALIDATION_ERROR) when size has null base_price_vnd", async () => {
    const itemWithNullSize = {
      ...latteMenuItem,
      sizes: [
        { size: "SMALL", base_price_vnd: null }, // null = not sold
        { size: "MEDIUM", base_price_vnd: 55000 },
      ],
    };
    const tx = makeTx({ menuItemResult: itemWithNullSize });

    await expect(
      processOrderItems(
        [
          {
            menu_item_id: MENU_ITEM_ID,
            quantity: 1,
            size: "SMALL", // this size not sold
            sweetness: "QUARTER",
            addon_option_ids: [],
            client_price_vnd: 45000,
          },
        ],
        tx as never
      )
    ).rejects.toMatchObject({ name: "OrderValidationError", code: "VALIDATION_ERROR" });
  });

  it("throws OrderValidationError (NOT_FOUND) when addon option does not exist", async () => {
    mockResolveOrderItemPrice.mockReturnValue(69000);
    const tx = makeTx({
      menuItemResult: latteMenuItem,
      addonResults: {}, // no addon results â†’ all return null
    });

    await expect(
      processOrderItems(
        [
          {
            menu_item_id: MENU_ITEM_ID,
            quantity: 1,
            size: "MEDIUM",
            sweetness: "QUARTER",
            addon_option_ids: [{ option_id: "nonexistent-addon", quantity: 1 }],
            client_price_vnd: 69000,
          },
        ],
        tx as never
      )
    ).rejects.toMatchObject({ name: "OrderValidationError", code: "NOT_FOUND" });
  });
});
