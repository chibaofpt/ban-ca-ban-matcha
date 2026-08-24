// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePriceMap } from "@/src/components/shared/product-modal/usePriceMap";
import type { MenuItem } from "@/src/lib/types/menu";
import type { MyVoucher } from "@/src/services/customerVoucherService";

const item = {
  id: "fusion-1", name: "Fusion", category: "fusion", sizes: [
    { size: "SMALL", base_price_vnd: 30_000, milk_ml: 0 },
    { size: "MEDIUM", base_price_vnd: 40_000, milk_ml: 0 },
  ], custom_powder_grams: null, resolved_default_powder_id: "powder-1",
  default_base_liquid_id: null, allowed_powder_ids: [], image_url: null,
} as unknown as MenuItem;
const voucher = {
  qr_token: "pd-1", voucher_type: "PRODUCT_DISCOUNT", product_discount_mode: "PAY_AS_SIZE",
  reference_size: "SMALL", discount_value: null, covered_price_vnd: null,
} as unknown as MyVoucher;

function props(size: "SMALL" | "MEDIUM") {
  return {
    item, milkTypes: [], addonGroups: [], latteItems: [], powders: [{ id: "powder-1", price_per_gram: 0, size_config: [] }],
    defaultPowderGrams: [], selectedSize: size, activePowderId: "powder-1", selectedMilkId: "",
    quantityMap: {}, selectedOptionIds: [], selectedAddonVoucherIds: [], availableVouchers: [voucher],
    selectedProductVoucherId: voucher.qr_token, quantity: 1,
  } as unknown as Parameters<typeof usePriceMap>[0];
}

describe("PRODUCT_DISCOUNT edit reconstruction", () => {
  it("preserves type and recomputes benefit when configuration changes", () => {
    const { result, rerender } = renderHook(
      ({ size }: { size: "SMALL" | "MEDIUM" }) => usePriceMap(props(size)),
      { initialProps: { size: "MEDIUM" as "SMALL" | "MEDIUM" } },
    );
    expect(result.current.effectiveProductVoucherType).toBe("PRODUCT_DISCOUNT");
    expect(result.current.effectiveFreeCoveredPrice).toBe(10_000);
    rerender({ size: "SMALL" });
    expect(result.current.effectiveFreeCoveredPrice).toBe(0);
    expect(result.current.effectiveProductVoucherType).toBe("PRODUCT_DISCOUNT");
  });
});
