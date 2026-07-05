/**
 * Unit tests for lib/pricing.ts — server-side pricing wrapper.
 * Tests resolveOrderItemPrice and resolveOrderItemPremiumLatte.
 * Mocks Prisma — keeps src/utils/pricing.ts REAL (no mock).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock lib/prisma (prevent PrismaClient instantiation) ─────────────────────
vi.mock("@/lib/prisma", () => ({
  prisma: {
    defaultSizeConfig: { findMany: vi.fn() },
    powderSizeConfig: { findMany: vi.fn() },
    matchaPowder: { findMany: vi.fn(), findUnique: vi.fn() },
    milkType: { findMany: vi.fn() },
    menuItemSize: { findFirst: vi.fn() },
  },
}));

// ── Import AFTER mocks ───────────────────────────────────────────────────────
import {
  resolveOrderItemPrice,
  resolveOrderItemPremiumLatte,
  type PricingContext,
} from "@/lib/pricing";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const POWDER_MEYUMI = "powder-meyumi";
const POWDER_HANA = "powder-hana";
const MILK_DEFAULT = "milk-default";
const MILK_PREMIUM = "milk-premium";

/** Minimal PricingContext — seed values from pricing skill */
const basePricingCtx: PricingContext = {
  defaultSizeConfigs: [
    { size: "SMALL" as const, milk_ml: 130, powder_gram: 3.5 },
    { size: "MEDIUM" as const, milk_ml: 200, powder_gram: 4.5 },
    { size: "LARGE" as const, milk_ml: 300, powder_gram: 8.0 },
  ],
  powderSizeConfigMap: {},
  powderPriceMap: {
    [POWDER_MEYUMI]: 6000,
    [POWDER_HANA]: 8000,
  },
  defaultMilkPricePerMl: 40,
  milkPriceMap: {
    [MILK_DEFAULT]: 40,
    [MILK_PREMIUM]: 60,
  },
  availablePowders: [
    { id: POWDER_MEYUMI, name: "Meyumi" },
    { id: POWDER_HANA, name: "Hana" },
  ],
};

// ── resolveOrderItemPrice ────────────────────────────────────────────────────

describe("resolveOrderItemPrice", () => {
  describe("Latte", () => {
    it("tính giá Latte M cơ bản: base + ceil(gram × price + milk × milk_price, 1000)", () => {
      const price = resolveOrderItemPrice(
        {
          category: "latte",
          size: "SMALL",
          base_price_vnd: 45000,
          custom_powder_grams: null,
          powder_id: POWDER_MEYUMI,
          milk_type_id: null, // default milk
        },
        basePricingCtx
      );
      // 45000 + 3.5 * 6000 + 130 * 40 = 45000 + 21000 + 5200 = 71200 → 72000
      expect(price).toBe(72000);
    });

    it("Latte L: base + gram × price + milk", () => {
      const price = resolveOrderItemPrice(
        {
          category: "latte",
          size: "MEDIUM",
          base_price_vnd: 55000,
          custom_powder_grams: null,
          powder_id: POWDER_MEYUMI,
          milk_type_id: null,
        },
        basePricingCtx
      );
      // 55000 + 4.5 * 6000 + 200 * 40 = 55000 + 27000 + 8000 = 90000
      expect(price).toBe(90000);
    });

    it("Latte XL: size XL dùng default gram 8.0", () => {
      const price = resolveOrderItemPrice(
        {
          category: "latte",
          size: "LARGE",
          base_price_vnd: 65000,
          custom_powder_grams: null,
          powder_id: POWDER_MEYUMI,
          milk_type_id: null,
        },
        basePricingCtx
      );
      // 65000 + 8.0 * 6000 + 300 * 40 = 65000 + 48000 + 12000 = 125000
      expect(price).toBe(125000);
    });

    it("milk swap → dùng milkPriceMap[milk_type_id] thay vì default", () => {
      const price = resolveOrderItemPrice(
        {
          category: "latte",
          size: "MEDIUM",
          base_price_vnd: 55000,
          custom_powder_grams: null,
          powder_id: POWDER_MEYUMI,
          milk_type_id: MILK_PREMIUM, // 60/ml thay vì 40/ml
        },
        basePricingCtx
      );
      // 55000 + 4.5 * 6000 + 200 * 60 = 55000 + 27000 + 12000 = 94000
      expect(price).toBe(94000);
    });

    it("milk_type_id không tồn tại → fallback sang defaultMilkPricePerMl", () => {
      const price = resolveOrderItemPrice(
        {
          category: "latte",
          size: "MEDIUM",
          base_price_vnd: 55000,
          custom_powder_grams: null,
          powder_id: POWDER_MEYUMI,
          milk_type_id: "milk-nonexistent",
        },
        basePricingCtx
      );
      // Fallback to 40/ml: 55000 + 27000 + 8000 = 90000
      expect(price).toBe(90000);
    });

    it("powder_id không có trong powderPriceMap → price_per_gram = 0", () => {
      const price = resolveOrderItemPrice(
        {
          category: "latte",
          size: "MEDIUM",
          base_price_vnd: 55000,
          custom_powder_grams: null,
          powder_id: "powder-unknown",
          milk_type_id: null,
        },
        basePricingCtx
      );
      // 55000 + 4.5 * 0 + 200 * 40 = 55000 + 0 + 8000 = 63000
      expect(price).toBe(63000);
    });

    it("custom_powder_grams override gram resolution", () => {
      const price = resolveOrderItemPrice(
        {
          category: "latte",
          size: "MEDIUM",
          base_price_vnd: 55000,
          custom_powder_grams: { MEDIUM: 7.0 },
          powder_id: POWDER_MEYUMI,
          milk_type_id: null,
        },
        basePricingCtx
      );
      // 55000 + 7.0 * 6000 + 200 * 40 = 55000 + 42000 + 8000 = 105000
      expect(price).toBe(105000);
    });
  });

  describe("Fusion", () => {
    it("tính giá Fusion M cơ bản: base + ceil(gram × price, 1000) + premium_latte", () => {
      const price = resolveOrderItemPrice(
        {
          category: "fusion",
          size: "SMALL",
          base_price_vnd: 50000,
          custom_powder_grams: null,
          powder_id: POWDER_MEYUMI,
          premium_latte: 0,
        },
        basePricingCtx
      );
      // 50000 + 3.5 * 6000 + 0 = 71000
      expect(price).toBe(71000);
    });

    it("Fusion với premium_latte > 0 (bột đắt hơn default)", () => {
      const price = resolveOrderItemPrice(
        {
          category: "fusion",
          size: "MEDIUM",
          base_price_vnd: 60000,
          custom_powder_grams: null,
          powder_id: POWDER_HANA,
          premium_latte: 5000,
        },
        basePricingCtx
      );
      // 60000 + 4.5 * 8000 + 5000 = 60000 + 36000 + 5000 = 101000
      expect(price).toBe(101000);
    });

    it("Fusion KHÔNG dùng milk (milk_type_id bị ignore)", () => {
      const price = resolveOrderItemPrice(
        {
          category: "fusion",
          size: "SMALL",
          base_price_vnd: 50000,
          custom_powder_grams: null,
          powder_id: POWDER_MEYUMI,
          milk_type_id: MILK_PREMIUM, // should be ignored for fusion
          premium_latte: 0,
        },
        basePricingCtx
      );
      // 50000 + 3.5 * 6000 + 0 = 71000 (NOT affected by milk)
      expect(price).toBe(71000);
    });

    it("premium_latte = undefined → treated as 0", () => {
      const price = resolveOrderItemPrice(
        {
          category: "fusion",
          size: "SMALL",
          base_price_vnd: 50000,
          custom_powder_grams: null,
          powder_id: POWDER_MEYUMI,
          // premium_latte not provided
        },
        basePricingCtx
      );
      // 50000 + 3.5 * 6000 + 0 = 71000
      expect(price).toBe(71000);
    });
  });

  describe("powder size config override", () => {
    it("dùng powderSizeConfigMap khi có config riêng cho powder + size", () => {
      const ctxWithPowderConfig: PricingContext = {
        ...basePricingCtx,
        powderSizeConfigMap: {
          [POWDER_MEYUMI]: [
            { size: "SMALL" as const, grams: 4.0 },
            { size: "MEDIUM" as const, grams: 6.0 },
          ],
        },
      };
      const price = resolveOrderItemPrice(
        {
          category: "latte",
          size: "SMALL",
          base_price_vnd: 45000,
          custom_powder_grams: null,
          powder_id: POWDER_MEYUMI,
          milk_type_id: null,
        },
        ctxWithPowderConfig
      );
      // 45000 + 4.0 * 6000 + 130 * 40 = 45000 + 24000 + 5200 = 74200 → 75000
      expect(price).toBe(75000);
    });
  });
});

// ── resolveOrderItemPremiumLatte ─────────────────────────────────────────────

describe("resolveOrderItemPremiumLatte", () => {
  const LATTE_MEYUMI_ID = "latte-meyumi";
  const LATTE_HANA_ID = "latte-hana";

  function makeMockClient(overrides: {
    selectedPowder?: { reference_latte_item_id: string | null } | null;
    defaultPowder?: { reference_latte_item_id: string | null } | null;
    selectedSizePrice?: number | null;
    defaultSizePrice?: number | null;
  }) {
    return {
      defaultSizeConfig: { findMany: vi.fn() },
      powderSizeConfig: { findMany: vi.fn() },
      matchaPowder: {
        findMany: vi.fn(),
        findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          if (where.id === "selected-powder") {
            return Promise.resolve(overrides.selectedPowder ?? null);
          }
          if (where.id === "default-powder") {
            return Promise.resolve(overrides.defaultPowder ?? null);
          }
          return Promise.resolve(null);
        }),
      },
      milkType: { findMany: vi.fn() },
      menuItemSize: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { menu_item_id: string; size: string } }) => {
          if (where.menu_item_id === LATTE_MEYUMI_ID) {
            return Promise.resolve(
              overrides.selectedSizePrice !== undefined
                ? { base_price_vnd: overrides.selectedSizePrice }
                : null
            );
          }
          if (where.menu_item_id === LATTE_HANA_ID) {
            return Promise.resolve(
              overrides.defaultSizePrice !== undefined
                ? { base_price_vnd: overrides.defaultSizePrice }
                : null
            );
          }
          return Promise.resolve(null);
        }),
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cả 2 powder có reference → trả chênh lệch base_price_vnd", async () => {
    const client = makeMockClient({
      selectedPowder: { reference_latte_item_id: LATTE_MEYUMI_ID },
      defaultPowder: { reference_latte_item_id: LATTE_HANA_ID },
      selectedSizePrice: 90000,
      defaultSizePrice: 85000,
    });

    const result = await resolveOrderItemPremiumLatte(
      "selected-powder",
      "default-powder",
      "MEDIUM",
      client as any as Parameters<typeof resolveOrderItemPremiumLatte>[3]
    );

    expect(result).toBe(5000); // 90000 - 85000
  });

  it("selected powder rẻ hơn → trả số âm", async () => {
    const client = makeMockClient({
      selectedPowder: { reference_latte_item_id: LATTE_MEYUMI_ID },
      defaultPowder: { reference_latte_item_id: LATTE_HANA_ID },
      selectedSizePrice: 80000,
      defaultSizePrice: 85000,
    });

    const result = await resolveOrderItemPremiumLatte(
      "selected-powder",
      "default-powder",
      "MEDIUM",
      client as any as Parameters<typeof resolveOrderItemPremiumLatte>[3]
    );

    expect(result).toBe(-5000); // 80000 - 85000
  });

  it("selected powder thiếu reference_latte_item_id → trả 0", async () => {
    const client = makeMockClient({
      selectedPowder: { reference_latte_item_id: null },
      defaultPowder: { reference_latte_item_id: LATTE_HANA_ID },
    });

    const result = await resolveOrderItemPremiumLatte(
      "selected-powder",
      "default-powder",
      "MEDIUM",
      client as any as Parameters<typeof resolveOrderItemPremiumLatte>[3]
    );

    expect(result).toBe(0);
  });

  it("default powder thiếu reference_latte_item_id → trả 0", async () => {
    const client = makeMockClient({
      selectedPowder: { reference_latte_item_id: LATTE_MEYUMI_ID },
      defaultPowder: { reference_latte_item_id: null },
    });

    const result = await resolveOrderItemPremiumLatte(
      "selected-powder",
      "default-powder",
      "MEDIUM",
      client as any as Parameters<typeof resolveOrderItemPremiumLatte>[3]
    );

    expect(result).toBe(0);
  });

  it("selected powder không tồn tại → trả 0", async () => {
    const client = makeMockClient({
      selectedPowder: null,
      defaultPowder: { reference_latte_item_id: LATTE_HANA_ID },
    });

    const result = await resolveOrderItemPremiumLatte(
      "selected-powder",
      "default-powder",
      "MEDIUM",
      client as any as Parameters<typeof resolveOrderItemPremiumLatte>[3]
    );

    expect(result).toBe(0);
  });

  it("size không tìm thấy cho selected latte → base_price_vnd = 0", async () => {
    const client = makeMockClient({
      selectedPowder: { reference_latte_item_id: LATTE_MEYUMI_ID },
      defaultPowder: { reference_latte_item_id: LATTE_HANA_ID },
      selectedSizePrice: null, // size not found
      defaultSizePrice: 85000,
    });

    const result = await resolveOrderItemPremiumLatte(
      "selected-powder",
      "default-powder",
      "LARGE",
      client as any as Parameters<typeof resolveOrderItemPremiumLatte>[3]
    );

    // null fallback to 0: 0 - 85000 = -85000
    expect(result).toBe(-85000);
  });

  it("cùng giá → trả 0 (không premium)", async () => {
    const client = makeMockClient({
      selectedPowder: { reference_latte_item_id: LATTE_MEYUMI_ID },
      defaultPowder: { reference_latte_item_id: LATTE_HANA_ID },
      selectedSizePrice: 90000,
      defaultSizePrice: 90000,
    });

    const result = await resolveOrderItemPremiumLatte(
      "selected-powder",
      "default-powder",
      "MEDIUM",
      client as any as Parameters<typeof resolveOrderItemPremiumLatte>[3]
    );

    expect(result).toBe(0);
  });
});
