/**
 * Unit & Integration tests for VoucherDetailSheet "Dùng ngay" pure helpers.
 *
 * Covers:
 *  - findCheapestScope: Selects the most economical available scope from a bundle rule
 *  - canApplyDiscount: Validates minimum order threshold for DISCOUNT vouchers
 *  - canApplyFreeship: Validates delivery order type and threshold for FREESHIP vouchers
 *  - buildBundleItemConfig: Constructs valid item configuration from scope snapshot
 *  - Regression/Integration: Verifies compatibility with deriveBundleSelectionState
 *
 * TDD Phase: These tests will FAIL until `src/lib/utils/voucherUseNowHelpers.ts` is implemented.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Import helper functions to be implemented ─────────────────────────────────
import {
  findCheapestScope,
  canApplyDiscount,
  canApplyFreeship,
  buildBundleItemConfig,
  type CanApplyDiscountResult,
  type CanApplyFreeshipResult,
  type BundleItemConfig,
} from "@/src/lib/utils/voucherUseNowHelpers";

// ── Import existing domain types and helpers ──────────────────────────────────
import {
  deriveBundleSelectionState,
  type BundleCartSummaryItem,
  type BundleVoucherSummary,
} from "@/src/lib/utils/bundleVoucher";
import type { BundleVoucherRule } from "@/src/services/customerVoucherService";
import type { MenuItem, MilkTypeOption } from "@/src/lib/types/menu";

// Scope type alias from BundleVoucherRule
type BundleProductScope = BundleVoucherRule["qualifier_products"][number];

// ── Test Fixtures ─────────────────────────────────────────────────────────────

const mockMilkTypes: MilkTypeOption[] = [
  { id: "milk-fresh", name: "Sữa tươi thanh trùng", price_per_ml: 40, is_default: true, display_order: 0, is_active: true },
  { id: "milk-oat", name: "Sữa yến mạch Oatly", price_per_ml: 60, is_default: false, display_order: 1, is_active: true },
  { id: "milk-soy", name: "Sữa đậu nành", price_per_ml: 50, is_default: false, display_order: 2, is_active: true },
];

const mockLatteItem: MenuItem = {
  id: "item-latte-01",
  name: "Matcha Latte Truyền Thống",
  description: "Matcha chuẩn vị Nhật",
  category: "latte",
  is_seasonal: false,
  image_url: "https://example.com/latte.jpg",
  sort_order: 1,
  base_liquid_note: null,
  custom_powder_grams: null,
  powder: { id: "powder-haru", name: "Haru Matcha", type: "RECOMMEND" },
  resolved_default_powder_id: "powder-haru",
  allowed_powder_ids: ["powder-haru", "powder-aki"],
  default_base_liquid_id: "milk-fresh",
  allowed_base_liquid_ids: ["milk-fresh", "milk-oat", "milk-soy"],
  sizes: [
    { size: "SMALL", base_price_vnd: 45_000, milk_ml: 150 },
    { size: "MEDIUM", base_price_vnd: 55_000, milk_ml: 200 },
    { size: "LARGE", base_price_vnd: 65_000, milk_ml: 250 },
  ],
};

function createScope(overrides: Partial<BundleProductScope>): BundleProductScope {
  return {
    menu_item_id: "item-latte-01",
    default_powder_id: "powder-haru",
    default_base_liquid_id: "milk-fresh",
    allowed_sizes: ["SMALL"],
    menu_item: {
      name: "Matcha Latte Truyền Thống",
      category: "latte",
      is_available: true,
    },
    ...overrides,
  };
}

// ── Test Suites ───────────────────────────────────────────────────────────────

describe("findCheapestScope — Chọn product grouped khả dụng", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("trả về product khả dụng đầu tiên vì giá được resolve riêng", () => {
    const scopes: BundleProductScope[] = [
      createScope({ menu_item_id: "item-1" }),
      createScope({ menu_item_id: "item-2" }),
    ];

    const result = findCheapestScope(scopes);
    expect(result?.menu_item_id).toBe("item-1");
  });

  it("bỏ qua product có menu_item.is_available === false", () => {
    const scopes: BundleProductScope[] = [
      createScope({
        menu_item_id: "item-unavailable",
        menu_item: { name: "Món hết hàng", category: "latte", is_available: false },
      }),
      createScope({
        menu_item_id: "item-available",
        menu_item: { name: "Món còn hàng", category: "latte", is_available: true },
      }),
    ];

    const result = findCheapestScope(scopes);
    expect(result?.menu_item_id).toBe("item-available");
  });

  it("trả về null nếu danh sách scopes rỗng", () => {
    const result = findCheapestScope([]);
    expect(result).toBeNull();
  });

  it("trả về null nếu tất cả scopes đều có is_available === false", () => {
    const scopes: BundleProductScope[] = [
      createScope({
        menu_item_id: "item-1",
        menu_item: { name: "Món 1", category: "latte", is_available: false },
      }),
      createScope({
        menu_item_id: "item-2",
        menu_item: { name: "Món 2", category: "latte", is_available: false },
      }),
    ];

    const result = findCheapestScope(scopes);
    expect(result).toBeNull();
  });

  it("trả về đúng scope khi chỉ có 1 scope duy nhất và available", () => {
    const singleScope = createScope({ menu_item_id: "item-single" });
    const result = findCheapestScope([singleScope]);
    expect(result).toEqual(singleScope);
  });
});

describe("canApplyDiscount — Kiểm tra điều kiện áp dụng DISCOUNT voucher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("min_order_vnd === null → luôn canApply: true và deficitVnd: 0", () => {
    const resultSubtotalPositive: CanApplyDiscountResult = canApplyDiscount(50_000, null);
    expect(resultSubtotalPositive.canApply).toBe(true);
    expect(resultSubtotalPositive.deficitVnd).toBe(0);

    const resultSubtotalZero: CanApplyDiscountResult = canApplyDiscount(0, null);
    expect(resultSubtotalZero.canApply).toBe(true);
    expect(resultSubtotalZero.deficitVnd).toBe(0);
  });

  it("subtotalVnd >= min_order_vnd → canApply: true và deficitVnd: 0 khi subtotal lớn hơn", () => {
    const result: CanApplyDiscountResult = canApplyDiscount(100_000, 80_000);
    expect(result.canApply).toBe(true);
    expect(result.deficitVnd).toBe(0);
  });

  it("subtotalVnd === min_order_vnd → canApply: true và deficitVnd: 0 khi subtotal bằng đúng mức tối thiểu", () => {
    const result: CanApplyDiscountResult = canApplyDiscount(80_000, 80_000);
    expect(result.canApply).toBe(true);
    expect(result.deficitVnd).toBe(0);
  });

  it("subtotalVnd < min_order_vnd → canApply: false và deficitVnd = min_order_vnd - subtotalVnd", () => {
    const result: CanApplyDiscountResult = canApplyDiscount(60_000, 100_000);
    expect(result.canApply).toBe(false);
    expect(result.deficitVnd).toBe(40_000);
  });

  it("subtotalVnd === 0 và min_order_vnd > 0 → canApply: false và deficitVnd bằng đúng min_order_vnd", () => {
    const result: CanApplyDiscountResult = canApplyDiscount(0, 50_000);
    expect(result.canApply).toBe(false);
    expect(result.deficitVnd).toBe(50_000);
  });

  it("min_order_vnd === 0 → canApply: true và deficitVnd: 0", () => {
    const result: CanApplyDiscountResult = canApplyDiscount(0, 0);
    expect(result.canApply).toBe(true);
    expect(result.deficitVnd).toBe(0);
  });
});

describe("canApplyFreeship — Kiểm tra điều kiện áp dụng FREESHIP voucher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("orderType !== DELIVERY (PICKUP, COUNTER) → canApply: false với lý do yêu cầu đơn giao hàng", () => {
    const resultPickup: CanApplyFreeshipResult = canApplyFreeship("PICKUP", 150_000, 100_000, 20_000);
    expect(resultPickup.canApply).toBe(false);
    expect(resultPickup.reason).toBeDefined();
    expect(resultPickup.reason?.toLowerCase()).toContain("giao hàng");

    const resultCounter: CanApplyFreeshipResult = canApplyFreeship("COUNTER", 150_000, null, 20_000);
    expect(resultCounter.canApply).toBe(false);
    expect(resultCounter.reason?.toLowerCase()).toContain("giao hàng");
  });

  it("orderType === DELIVERY nhưng shippingFee === null → canApply: false với lý do chưa có phí vận chuyển", () => {
    const result: CanApplyFreeshipResult = canApplyFreeship("DELIVERY", 100_000, 50_000, null);
    expect(result.canApply).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("orderType === DELIVERY nhưng shippingFee === 0 → canApply: false vì không có phí ship để giảm", () => {
    const result: CanApplyFreeshipResult = canApplyFreeship("DELIVERY", 100_000, 50_000, 0);
    expect(result.canApply).toBe(false);
  });

  it("orderType === DELIVERY, min_order_vnd === null và shippingFee > 0 → canApply: true, deficitVnd: 0", () => {
    const result: CanApplyFreeshipResult = canApplyFreeship("DELIVERY", 50_000, null, 25_000);
    expect(result.canApply).toBe(true);
    expect(result.deficitVnd).toBe(0);
  });

  it("orderType === DELIVERY, totalVnd >= min_order_vnd và shippingFee > 0 → canApply: true, deficitVnd: 0", () => {
    const result: CanApplyFreeshipResult = canApplyFreeship("DELIVERY", 120_000, 100_000, 30_000);
    expect(result.canApply).toBe(true);
    expect(result.deficitVnd).toBe(0);

    const resultExact: CanApplyFreeshipResult = canApplyFreeship("DELIVERY", 100_000, 100_000, 30_000);
    expect(resultExact.canApply).toBe(true);
    expect(resultExact.deficitVnd).toBe(0);
  });

  it("orderType === DELIVERY, totalVnd < min_order_vnd và shippingFee > 0 → canApply: false với deficitVnd chính xác và reason", () => {
    const result: CanApplyFreeshipResult = canApplyFreeship("DELIVERY", 70_000, 100_000, 25_000);
    expect(result.canApply).toBe(false);
    expect(result.deficitVnd).toBe(30_000);
    expect(result.reason).toBeDefined();
  });

  it("orderType === DELIVERY, totalVnd === 0 và min_order_vnd > 0 → canApply: false với deficit bằng đúng min_order_vnd", () => {
    const result: CanApplyFreeshipResult = canApplyFreeship("DELIVERY", 0, 100_000, 25_000);
    expect(result.canApply).toBe(false);
    expect(result.deficitVnd).toBe(100_000);
  });
});

describe("buildBundleItemConfig — Xây dựng cấu hình món từ Bundle Scope snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tạo BundleItemConfig hợp lệ từ scope, menuItem và milkTypes", () => {
    const scope = createScope({
      menu_item_id: "item-latte-01",
      allowed_sizes: ["MEDIUM"],
      default_powder_id: "powder-haru",
      default_base_liquid_id: "milk-oat",
    });

    const config: BundleItemConfig = buildBundleItemConfig(
      scope,
      mockLatteItem,
      mockMilkTypes,
      55_000,
    );

    expect(config).toBeDefined();
    expect(config.menuItemId).toBe("item-latte-01");
    expect(config.size).toBe("MEDIUM");
    expect(config.unitPriceVnd).toBe(55_000);
    expect(config.powderId).toBe("powder-haru");
  });

  it("sử dụng size từ scope thay vì size mặc định của menu item", () => {
    const scope = createScope({
      allowed_sizes: ["LARGE"],
    });

    const config = buildBundleItemConfig(scope, mockLatteItem, mockMilkTypes, 65_000);
    expect(config.size).toBe("LARGE");
  });

  it("giữ nguyên gross price đã resolve làm unitPriceVnd", () => {
    const scope = createScope({});

    const config = buildBundleItemConfig(scope, mockLatteItem, mockMilkTypes, 48_000);
    expect(config.unitPriceVnd).toBe(48_000);
  });

  it("resolve baseLiquidId / milkTypeId từ scope khi hợp lệ trong danh sách milkTypes", () => {
    const scope = createScope({
      default_base_liquid_id: "milk-oat",
    });

    const config = buildBundleItemConfig(scope, mockLatteItem, mockMilkTypes);
    expect(config.milkTypeId ?? config.baseLiquidId).toBe("milk-oat");
  });

  it("fallback về default milk type khi default_base_liquid_id là null hoặc không tồn tại", () => {
    const scopeNullMilk = createScope({
      default_base_liquid_id: null,
    });
    const configNull = buildBundleItemConfig(scopeNullMilk, mockLatteItem, mockMilkTypes);
    expect(configNull.milkTypeId ?? configNull.baseLiquidId).toBe("milk-fresh");

    const scopeUnknownMilk = createScope({
      default_base_liquid_id: "milk-non-existent",
    });
    const configUnknown = buildBundleItemConfig(scopeUnknownMilk, mockLatteItem, mockMilkTypes);
    expect(configUnknown.milkTypeId ?? configUnknown.baseLiquidId).toBe("milk-fresh");
  });
});

describe("Integration / Regression — Tích hợp findCheapestScope với deriveBundleSelectionState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const bundleSummary: BundleVoucherSummary = {
    qr_token: "bundle-token-test-1234",
    buy_quantity: 2,
    reward_quantity: 1,
    reward_kind: "PRODUCT",
    reward_mode: "ALLOWED_SCOPE",
    benefit_scaling: "PER_BUNDLE",
    max_applications_per_order: 1,
    max_reward_units_per_order: null,
    eligible_menu_item_ids: ["item-latte-01", "item-fusion-02"],
    reward_menu_item_ids: ["item-latte-01", "item-fusion-02"],
    min_order_vnd: null,
  };

  it("scope grouped đã chọn tương thích với logic deriveBundleSelectionState", () => {
    const scopes: BundleProductScope[] = [
      createScope({ menu_item_id: "item-latte-01" }),
      createScope({ menu_item_id: "item-fusion-02" }),
    ];

    const cheapest = findCheapestScope(scopes);
    expect(cheapest).not.toBeNull();
    expect(cheapest?.menu_item_id).toBe("item-latte-01");

    // Build cart item from cheapest scope
    const cart: BundleCartSummaryItem[] = [
      {
        client_line_id: "line-cheapest",
        menu_item_id: cheapest!.menu_item_id,
        label: "Món tiết kiệm nhất",
        quantity: 2,
        unit_price_vnd: 45_000,
        product_voucher_quantity: 0,
        addons: [],
      },
    ];

    // State before reward allocation
    const stateBeforeAllocation = deriveBundleSelectionState({
      voucher: bundleSummary,
      cart,
      allocations: [],
    });
    expect(stateBeforeAllocation).toEqual({
      status: "NEEDS_REWARD",
      message: "Chọn 1 món quà",
    });

    // State after valid reward allocation
    const stateAfterAllocation = deriveBundleSelectionState({
      voucher: bundleSummary,
      cart: [
        ...cart,
        {
          client_line_id: "line-reward",
          menu_item_id: cheapest!.menu_item_id,
          label: "Món quà tặng",
          quantity: 1,
          unit_price_vnd: 45_000,
          product_voucher_quantity: 0,
          addons: [],
        },
      ],
      allocations: [{ client_line_id: "line-reward", quantity: 1 }],
    });
    expect(stateAfterAllocation.status).toBe("READY");
  });

  it("khi giỏ hàng tạo từ cheapest scope chưa đủ buy_quantity thì deriveBundleSelectionState báo INELIGIBLE", () => {
    const scopes: BundleProductScope[] = [
      createScope({ menu_item_id: "item-latte-01" }),
    ];
    const cheapest = findCheapestScope(scopes);

    const cart: BundleCartSummaryItem[] = [
      {
        client_line_id: "line-1",
        menu_item_id: cheapest!.menu_item_id,
        label: "Matcha Latte",
        quantity: 1, // Only 1, buy_quantity requires 2
        unit_price_vnd: 45_000,
        product_voucher_quantity: 0,
        addons: [],
      },
    ];

    const state = deriveBundleSelectionState({
      voucher: bundleSummary,
      cart,
      allocations: [],
    });

    expect(state.status).toBe("INELIGIBLE");
    expect(state.message).toContain("Cần thêm 1 món đủ điều kiện");
  });
});
