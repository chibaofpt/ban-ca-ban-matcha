import { beforeEach, describe, expect, it, vi } from "vitest";

const mockBuildPricingContext = vi.fn();
const mockResolveOrderItemPrice = vi.fn();
const mockResolveOrderItemBaseLiquidMl = vi.fn();

vi.mock("@/lib/pricing", () => ({
  buildPricingContext: (...args: unknown[]) => mockBuildPricingContext(...args),
  resolveOrderItemPrice: (...args: unknown[]) => mockResolveOrderItemPrice(...args),
  resolveOrderItemPremiumLatte: vi.fn(),
  resolveOrderItemBaseLiquidMl: (...args: unknown[]) => mockResolveOrderItemBaseLiquidMl(...args),
}));

import { OrderValidationError, processOrderItems, type OrderItemInput } from "@/lib/orders";

const EXTRA_ID = "extra-dessert-1";
const basePricingContext = {
  defaultSizeConfigs: [],
  powderSizeConfigMap: {},
  powderPriceMap: {},
  defaultMilkPricePerMl: 40,
  defaultBaseLiquidId: null,
  milkPriceMap: {},
  availablePowders: [],
};

function makeTx() {
  return {
    menuItem: {
      findUnique: vi.fn().mockResolvedValue({
        id: EXTRA_ID,
        name: "Bánh matcha",
        category: "extras",
        is_available: true,
        unit_price_vnd: 26_000,
        sizes: [],
        matcha_powder_id: null,
        default_powder_id: null,
        default_base_liquid_id: null,
        fusionAllowedPowders: [],
        allowedBaseLiquids: [],
      }),
    },
    addonOption: { findUnique: vi.fn() },
  };
}

describe("processOrderItems — extras", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildPricingContext.mockResolvedValue(basePricingContext);
    mockResolveOrderItemBaseLiquidMl.mockReturnValue(0);
    mockResolveOrderItemPrice.mockReturnValue(99_000);
  });

  it("giải giá cố định theo quantity mà không yêu cầu size, bột hoặc Base Liquid", async () => {
    const tx = makeTx();
    const input = {
      menu_item_id: EXTRA_ID,
      category: "extras",
      quantity: 2,
      size: undefined,
      note: "Để riêng",
      addon_option_ids: [],
      client_price_vnd: 26_000,
    } as unknown as OrderItemInput;

    const result = await processOrderItems([input], tx as never);
    const line = result[0] as unknown as Record<string, unknown>;

    expect(line).toMatchObject({
      menu_item_id: EXTRA_ID,
      quantity: 2,
      size: null,
      selected_powder_id: null,
      selected_milk_type_id: null,
      unit_price_vnd: 26_000,
      addons_price_vnd: 0,
      line_total: 52_000,
    });
    expect(mockResolveOrderItemPrice).not.toHaveBeenCalled();
  });

  it("dùng category từ DB, không dùng category giả do client gửi để chọn pricing branch", async () => {
    const tx = makeTx();
    const input = {
      menu_item_id: EXTRA_ID,
      // Deliberately lie: the DB fixture is category=extras.
      category: "latte",
      quantity: 1,
      size: undefined,
      addon_option_ids: [],
      client_price_vnd: 26_000,
    } as unknown as OrderItemInput;

    const result = await processOrderItems([input], tx as never);
    const line = result[0] as unknown as Record<string, unknown>;

    expect(line).toMatchObject({
      menu_item_id: EXTRA_ID,
      size: null,
      unit_price_vnd: 26_000,
      line_total: 26_000,
    });
    expect(mockResolveOrderItemPrice).not.toHaveBeenCalled();
  });

  it("từ chối extras nếu client gửi cấu hình đồ uống hoặc addon", async () => {
    const tx = makeTx();
    const input = {
      menu_item_id: EXTRA_ID,
      category: "extras",
      quantity: 1,
      size: undefined,
      selected_powder_id: "powder-forbidden",
      selected_base_liquid_id: "milk-forbidden",
      addon_option_ids: [{ option_id: "addon-forbidden", quantity: 1 }],
      client_price_vnd: 26_000,
    } as unknown as OrderItemInput;

    await expect(processOrderItems([input], tx as never)).rejects.toMatchObject({
      name: "OrderValidationError",
      code: "VALIDATION_ERROR",
    } satisfies Partial<OrderValidationError>);
  });
});
