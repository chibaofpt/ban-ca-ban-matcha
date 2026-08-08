/**
 * Unit tests for lib/pricing.ts — buildPricingContext.
 * Mocks Prisma findMany calls, verifies context shape + population.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock lib/prisma ───────────────────────────────────────────────────────────

const mockDefaultSizeConfigFindMany = vi.fn();
const mockPowderSizeConfigFindMany = vi.fn();
const mockMatchaPowderFindMany = vi.fn();
const mockMilkTypeFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    defaultSizeConfig: { findMany: (...args: unknown[]) => mockDefaultSizeConfigFindMany(...args) },
    powderSizeConfig: { findMany: (...args: unknown[]) => mockPowderSizeConfigFindMany(...args) },
    matchaPowder: { findMany: (...args: unknown[]) => mockMatchaPowderFindMany(...args), findUnique: vi.fn() },
    milkType: { findMany: (...args: unknown[]) => mockMilkTypeFindMany(...args) },
    menuItemSize: { findFirst: vi.fn() },
  },
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
import { buildPricingContext } from "@/lib/pricing";
import { Decimal } from "@prisma/client/runtime/library";

// ── DB row fixtures ───────────────────────────────────────────────────────────

const POWDER_MEYUMI_ID = "powder-meyumi-uuid";
const POWDER_HANA_ID   = "powder-hana-uuid";
const MILK_DEFAULT_ID  = "milk-default-uuid";
const MILK_PREMIUM_ID  = "milk-premium-uuid";

const dbDefaultSizeConfigs = [
  { size: "SMALL",  milk_ml: 130, powder_gram: new Decimal("3.5") },
  { size: "MEDIUM", milk_ml: 200, powder_gram: new Decimal("4.5") },
  { size: "LARGE",  milk_ml: 300, powder_gram: new Decimal("8.0") },
];

const dbPowderSizeConfigs = [
  { powder_id: POWDER_MEYUMI_ID, size: "SMALL",  grams: new Decimal("4.0") },
  { powder_id: POWDER_MEYUMI_ID, size: "MEDIUM", grams: new Decimal("6.0") },
  { powder_id: POWDER_HANA_ID,   size: "SMALL",  grams: new Decimal("4.5") },
];

const dbPowders = [
  { id: POWDER_MEYUMI_ID, name: "Meyumi", price_per_gram: 6000, is_available: true },
  { id: POWDER_HANA_ID,   name: "Hana",   price_per_gram: 8000, is_available: true },
];

const dbMilkTypes = [
  { id: MILK_DEFAULT_ID, name: "Sữa bò",    price_per_ml: 40, is_default: true,  is_active: true },
  { id: MILK_PREMIUM_ID, name: "Sữa hạnh nhân", price_per_ml: 60, is_default: false, is_active: true },
];

// ── Helper ─────────────────────────────────────────────────────────────────

/** Build a mock db client (mimics PrismaTransactionClient shape) */
function makeMockClient() {
  return {
    defaultSizeConfig: { findMany: mockDefaultSizeConfigFindMany },
    powderSizeConfig:  { findMany: mockPowderSizeConfigFindMany  },
    matchaPowder:      { findMany: mockMatchaPowderFindMany, findUnique: vi.fn() },
    milkType:          { findMany: mockMilkTypeFindMany          },
    menuItemSize:      { findFirst: vi.fn()                      },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("buildPricingContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: happy path data
    mockDefaultSizeConfigFindMany.mockResolvedValue(dbDefaultSizeConfigs);
    mockPowderSizeConfigFindMany.mockResolvedValue(dbPowderSizeConfigs);
    mockMatchaPowderFindMany.mockResolvedValue(dbPowders);
    mockMilkTypeFindMany.mockResolvedValue(dbMilkTypes);
  });

  // ── defaultSizeConfigs ────────────────────────────────────────────────────

  describe("defaultSizeConfigs", () => {
    it("map 3 rows từ DB → đúng shape { size, milk_ml, powder_gram: number }", async () => {
      const ctx = await buildPricingContext(makeMockClient() as never);

      expect(ctx.defaultSizeConfigs).toHaveLength(3);
      expect(ctx.defaultSizeConfigs[0]).toEqual({ size: "SMALL",  milk_ml: 130, powder_gram: 3.5 });
      expect(ctx.defaultSizeConfigs[1]).toEqual({ size: "MEDIUM", milk_ml: 200, powder_gram: 4.5 });
      expect(ctx.defaultSizeConfigs[2]).toEqual({ size: "LARGE",  milk_ml: 300, powder_gram: 8.0 });
    });

    it("Decimal powder_gram được convert sang number", async () => {
      const ctx = await buildPricingContext(makeMockClient() as never);

      ctx.defaultSizeConfigs.forEach((c) => {
        expect(typeof c.powder_gram).toBe("number");
      });
    });

    it("query không filter — lấy toàn bộ default size configs", async () => {
      await buildPricingContext(makeMockClient() as never);

      expect(mockDefaultSizeConfigFindMany).toHaveBeenCalledWith();
    });
  });

  // ── powderPriceMap ────────────────────────────────────────────────────────

  describe("powderPriceMap", () => {
    it("map powder_id → price_per_gram cho tất cả available powders", async () => {
      const ctx = await buildPricingContext(makeMockClient() as never);

      expect(ctx.powderPriceMap[POWDER_MEYUMI_ID]).toBe(6000);
      expect(ctx.powderPriceMap[POWDER_HANA_ID]).toBe(8000);
    });

    it("chỉ query powder với is_available: true", async () => {
      await buildPricingContext(makeMockClient() as never);

      expect(mockMatchaPowderFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { is_available: true } })
      );
    });

    it("không có powder nào → powderPriceMap = {}", async () => {
      mockMatchaPowderFindMany.mockResolvedValue([]);

      const ctx = await buildPricingContext(makeMockClient() as never);

      expect(ctx.powderPriceMap).toEqual({});
    });
  });

  // ── availablePowders ──────────────────────────────────────────────────────

  describe("availablePowders", () => {
    it("list { id, name } cho tất cả available powders", async () => {
      const ctx = await buildPricingContext(makeMockClient() as never);

      expect(ctx.availablePowders).toHaveLength(2);
      expect(ctx.availablePowders[0]).toEqual({ id: POWDER_MEYUMI_ID, name: "Meyumi" });
      expect(ctx.availablePowders[1]).toEqual({ id: POWDER_HANA_ID,   name: "Hana"   });
    });

    it("không có powder nào → availablePowders = []", async () => {
      mockMatchaPowderFindMany.mockResolvedValue([]);

      const ctx = await buildPricingContext(makeMockClient() as never);

      expect(ctx.availablePowders).toEqual([]);
    });

    it("powder bị unavailable bị loại khỏi list", async () => {
      mockMatchaPowderFindMany.mockResolvedValue([
        { id: POWDER_MEYUMI_ID, name: "Meyumi", price_per_gram: 6000, is_available: true },
        // HANA bị unavailable — không trả về vì query where is_available:true
      ]);

      const ctx = await buildPricingContext(makeMockClient() as never);

      expect(ctx.availablePowders).toHaveLength(1);
      expect(ctx.availablePowders[0].name).toBe("Meyumi");
    });
  });

  // ── powderSizeConfigMap ───────────────────────────────────────────────────

  describe("powderSizeConfigMap", () => {
    it("nhóm powder size configs theo powder_id", async () => {
      const ctx = await buildPricingContext(makeMockClient() as never);

      expect(ctx.powderSizeConfigMap[POWDER_MEYUMI_ID]).toHaveLength(2);
      expect(ctx.powderSizeConfigMap[POWDER_HANA_ID]).toHaveLength(1);
    });

    it("mỗi entry có { size, grams: number }", async () => {
      const ctx = await buildPricingContext(makeMockClient() as never);

      const meyumiConfigs = ctx.powderSizeConfigMap[POWDER_MEYUMI_ID];
      expect(meyumiConfigs[0]).toEqual({ size: "SMALL",  grams: 4.0 });
      expect(meyumiConfigs[1]).toEqual({ size: "MEDIUM", grams: 6.0 });
    });

    it("Decimal grams được convert sang number", async () => {
      const ctx = await buildPricingContext(makeMockClient() as never);

      Object.values(ctx.powderSizeConfigMap).flat().forEach((c) => {
        expect(typeof c.grams).toBe("number");
      });
    });

    it("không có powder size config → powderSizeConfigMap = {}", async () => {
      mockPowderSizeConfigFindMany.mockResolvedValue([]);

      const ctx = await buildPricingContext(makeMockClient() as never);

      expect(ctx.powderSizeConfigMap).toEqual({});
    });
  });

  // ── milkPriceMap + defaultMilkPricePerMl ─────────────────────────────────

  describe("milk pricing", () => {
    it("milkPriceMap map milk_type_id → price_per_ml", async () => {
      const ctx = await buildPricingContext(makeMockClient() as never);

      expect(ctx.milkPriceMap[MILK_DEFAULT_ID]).toBe(40);
      expect(ctx.milkPriceMap[MILK_PREMIUM_ID]).toBe(60);
    });

    it("defaultMilkPricePerMl lấy từ milk có is_default: true", async () => {
      const ctx = await buildPricingContext(makeMockClient() as never);

      expect(ctx.defaultMilkPricePerMl).toBe(40);
    });

    it("không có default milk → defaultMilkPricePerMl = 40 (hardcoded fallback)", async () => {
      mockMilkTypeFindMany.mockResolvedValue([
        { id: MILK_PREMIUM_ID, name: "Sữa hạnh nhân", price_per_ml: 60, is_default: false, is_active: true },
      ]);

      const ctx = await buildPricingContext(makeMockClient() as never);

      expect(ctx.defaultMilkPricePerMl).toBe(40); // hardcoded fallback in source
    });

    it("chỉ query milk với is_active: true", async () => {
      await buildPricingContext(makeMockClient() as never);

      expect(mockMilkTypeFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { is_active: true } })
      );
    });

    it("không có milk nào → milkPriceMap = {}, defaultMilkPricePerMl = 40", async () => {
      mockMilkTypeFindMany.mockResolvedValue([]);

      const ctx = await buildPricingContext(makeMockClient() as never);

      expect(ctx.milkPriceMap).toEqual({});
      expect(ctx.defaultMilkPricePerMl).toBe(40);
    });
  });

  // ── Query calls ───────────────────────────────────────────────────────────

  describe("DB queries", () => {
    it("gọi đúng 4 queries một lần (không N+1)", async () => {
      await buildPricingContext(makeMockClient() as never);

      expect(mockDefaultSizeConfigFindMany).toHaveBeenCalledTimes(1);
      expect(mockPowderSizeConfigFindMany).toHaveBeenCalledTimes(1);
      expect(mockMatchaPowderFindMany).toHaveBeenCalledTimes(1);
      expect(mockMilkTypeFindMany).toHaveBeenCalledTimes(1);
    });
  });
});
