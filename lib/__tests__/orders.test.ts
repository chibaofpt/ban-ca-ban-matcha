/**
 * Unit tests for lib/orders.ts — processOrderItems core logic.
 *
 * Strategy: mock lib/pricing và lib/prisma để test thuần JS,
 * không cần kết nối DB thật.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

// ── Mock lib/prisma (prevent PrismaClient instantiation) ─────────────────────
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    menuItem: { findUnique: vi.fn() },
    addonOption: { findUnique: vi.fn() },
  },
}));

// ── Mock lib/pricing — return controlled values ───────────────────────────────
const mockBuildPricingContext = vi.fn();
const mockResolveOrderItemPrice = vi.fn();
const mockResolveOrderItemPremiumLatte = vi.fn();

vi.mock("@/lib/pricing", () => ({
  buildPricingContext: (...args: unknown[]) => mockBuildPricingContext(...args),
  resolveOrderItemPrice: (...args: unknown[]) => mockResolveOrderItemPrice(...args),
  resolveOrderItemPremiumLatte: (...args: unknown[]) => mockResolveOrderItemPremiumLatte(...args),
}));

// ── Import after mocks ────────────────────────────────────────────────────────
import {
  processOrderItems,
  OrderValidationError,
  PriceChangedError,
  type OrderItemInput,
} from "@/lib/orders";

// ── Shared fixtures ───────────────────────────────────────────────────────────

const POWDER_ID = "powder-aaa";
const MILK_ID = "milk-bbb";
const MENU_ITEM_ID = "item-latte-ccc";
const FUSION_ITEM_ID = "item-fusion-ddd";
const ADDON_KEM_ID = "addon-kem-eee";
const ADDON_EXTRA_MATCHA_ID = "addon-extra-fff";

/** Minimal PricingContext với 1 powder + 1 milk */
const basePricingCtx = {
  defaultSizeConfigs: [
    { size: "M" as const, milk_ml: 130, powder_gram: 3.5 },
    { size: "L" as const, milk_ml: 200, powder_gram: 4.5 },
    { size: "XL" as const, milk_ml: 300, powder_gram: 8.0 },
  ],
  powderPriceMap: { [POWDER_ID]: 6000 },
  powderSizeConfigMap: {},
  defaultMilkPricePerMl: 40,
  milkPriceMap: { [MILK_ID]: 40 },
};

/** Tạo mock tx object — override từng method cho từng test */
function makeTx(overrides: {
  menuItemResult?: object | null;
  addonResults?: Record<string, object | null>;
}) {
  return {
    menuItem: {
      findUnique: vi.fn().mockResolvedValue(overrides.menuItemResult ?? null),
    },
    addonOption: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(overrides.addonResults?.[where.id] ?? null)
      ),
    },
  };
}

/** Latte menu item mẫu */
const latteMenuItem = {
  id: MENU_ITEM_ID,
  name: "Trà Xanh Sữa",
  category: "latte",
  is_available: true,
  matcha_powder_id: POWDER_ID,
  default_powder_id: null,
  custom_powder_grams: null,
  fusionAllowedPowders: [],
  sizes: [
    { size: "M", base_price_vnd: 45000 },
    { size: "L", base_price_vnd: 55000 },
    { size: "XL", base_price_vnd: 65000 },
  ],
};

/** Fusion menu item mẫu */
const FUSION_DEFAULT_POWDER = "powder-default-fusion";
const FUSION_ALLOWED_POWDER = "powder-allowed-fusion";
const fusionMenuItem = {
  id: FUSION_ITEM_ID,
  name: "Matcha Cam",
  category: "fusion",
  is_available: true,
  matcha_powder_id: null,
  default_powder_id: FUSION_DEFAULT_POWDER,
  custom_powder_grams: null,
  fusionAllowedPowders: [{ powder_id: FUSION_ALLOWED_POWDER }],
  sizes: [
    { size: "M", base_price_vnd: 50000 },
    { size: "L", base_price_vnd: 60000 },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("processOrderItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildPricingContext.mockResolvedValue(basePricingCtx);
    mockResolveOrderItemPremiumLatte.mockResolvedValue(0);
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("returns processed item when price matches (Latte, no addons)", async () => {
    const SERVER_PRICE = 69000;
    mockResolveOrderItemPrice.mockReturnValue(SERVER_PRICE);

    const tx = makeTx({ menuItemResult: latteMenuItem });
    const input: OrderItemInput[] = [
      {
        menu_item_id: MENU_ITEM_ID,
        quantity: 2,
        size: "L",
        sweetness: "QUARTER",
        addon_option_ids: [],
        client_price_vnd: SERVER_PRICE,
      },
    ];

    const result = await processOrderItems(input, tx as never);

    expect(result).toHaveLength(1);
    expect(result[0].unit_price_vnd).toBe(SERVER_PRICE);
    expect(result[0].addons_price_vnd).toBe(0);
    expect(result[0].line_total).toBe(SERVER_PRICE * 2);
    expect(result[0].selected_powder_id).toBe(POWDER_ID); // Latte: auto-set
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
          size: "M",
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
          size: "L",
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

  // ── Addon pricing ──────────────────────────────────────────────────────────

  it("prices regular addons (kem, đá dừa) using price_vnd", async () => {
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
          size: "L",
          sweetness: "QUARTER",
          addon_option_ids: [{ option_id: ADDON_KEM_ID, quantity: 1 }],
          client_price_vnd: 77000, // 69000 + 8000
        },
      ],
      tx as never
    );

    expect(result[0].addons_price_vnd).toBe(8000);
    expect(result[0].resolvedAddons[0].unit_price_vnd).toBe(8000);
    expect(result[0].line_total).toBe((69000 + 8000) * 1);
  });

  it("prices extra matcha using gram_value × price_per_gram (NOT price_vnd=0)", async () => {
    // This is the bug fix: extra matcha price_vnd=0 but gram_value=2, price_per_gram=6000
    // Expected: 2 × 6000 = 12000, NOT 0
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
          size: "L",
          sweetness: "QUARTER",
          addon_option_ids: [{ option_id: ADDON_EXTRA_MATCHA_ID, quantity: 1 }],
          client_price_vnd: 81000, // 69000 + 12000
        },
      ],
      tx as never
    );

    // POWDER_ID has price_per_gram = 6000 in basePricingCtx
    expect(result[0].resolvedAddons[0].unit_price_vnd).toBe(12000); // 2g × 6000
    expect(result[0].addons_price_vnd).toBe(12000);
  });

  it("extra matcha with gram_value=0 (option 'không thêm') → price = 0", async () => {
    mockResolveOrderItemPrice.mockReturnValue(69000);
    const tx = makeTx({
      menuItemResult: latteMenuItem,
      addonResults: {
        [ADDON_EXTRA_MATCHA_ID]: {
          id: ADDON_EXTRA_MATCHA_ID,
          price_vnd: 0,
          gram_value: new Decimal("0"), // 0g — default option
        },
      },
    });

    const result = await processOrderItems(
      [
        {
          menu_item_id: MENU_ITEM_ID,
          quantity: 1,
          size: "L",
          sweetness: "QUARTER",
          addon_option_ids: [{ option_id: ADDON_EXTRA_MATCHA_ID, quantity: 1 }],
          client_price_vnd: 69000,
        },
      ],
      tx as never
    );

    expect(result[0].resolvedAddons[0].unit_price_vnd).toBe(0);
    expect(result[0].addons_price_vnd).toBe(0);
  });

  it("PRODUCT voucher → unit_price_vnd = 0, addons still charged", async () => {
    mockResolveOrderItemPrice.mockReturnValue(69000);
    const tx = makeTx({
      menuItemResult: latteMenuItem,
      addonResults: {
        [ADDON_KEM_ID]: { id: ADDON_KEM_ID, price_vnd: 8000, gram_value: null },
      },
    });

    const result = await processOrderItems(
      [
        {
          menu_item_id: MENU_ITEM_ID,
          quantity: 1,
          size: "L",
          sweetness: "QUARTER",
          addon_option_ids: [{ option_id: ADDON_KEM_ID, quantity: 1 }],
          product_voucher_id: "voucher-xyz",
          client_price_vnd: 8000, // 0 (free drink) + 8000 (addon)
        },
      ],
      tx as never
    );

    expect(result[0].unit_price_vnd).toBe(0);
    expect(result[0].addons_price_vnd).toBe(8000); // addons still charged
    expect(result[0].line_total).toBe(8000);
  });

  // ── Fusion powder validation ───────────────────────────────────────────────

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
          size: "M",
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
          size: "M",
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
      "M",
      tx
    );
  });

  it("Fusion: rejects powder not in allowed list → OrderValidationError", async () => {
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
            size: "M",
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

  // ── PRICE_CHANGED ──────────────────────────────────────────────────────────

  it("throws PriceChangedError when client_price_vnd != server price", async () => {
    mockResolveOrderItemPrice.mockReturnValue(69000);
    const tx = makeTx({ menuItemResult: latteMenuItem });

    const err = await processOrderItems(
      [
        {
          menu_item_id: MENU_ITEM_ID,
          quantity: 1,
          size: "L",
          sweetness: "QUARTER",
          addon_option_ids: [],
          client_price_vnd: 65000, // wrong — should be 69000
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
          size: "L",
          sweetness: "QUARTER",
          addon_option_ids: [],
          client_price_vnd: 60000, // wrong
        },
        {
          menu_item_id: MENU_ITEM_ID,
          quantity: 2,
          size: "M",
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

  // ── Validation errors ──────────────────────────────────────────────────────

  it("throws OrderValidationError (NOT_FOUND) when menu item does not exist", async () => {
    const tx = makeTx({ menuItemResult: null });

    await expect(
      processOrderItems(
        [
          {
            menu_item_id: "nonexistent-id",
            quantity: 1,
            size: "L",
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
            size: "L",
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
        { size: "M", base_price_vnd: null }, // null = not sold
        { size: "L", base_price_vnd: 55000 },
      ],
    };
    const tx = makeTx({ menuItemResult: itemWithNullSize });

    await expect(
      processOrderItems(
        [
          {
            menu_item_id: MENU_ITEM_ID,
            quantity: 1,
            size: "M", // this size not sold
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
      addonResults: {}, // no addon results → all return null
    });

    await expect(
      processOrderItems(
        [
          {
            menu_item_id: MENU_ITEM_ID,
            quantity: 1,
            size: "L",
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
