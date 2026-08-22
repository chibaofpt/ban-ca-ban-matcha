import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockAddItem } = vi.hoisted(() => ({ mockAddItem: vi.fn() }));

vi.mock("@/src/lib/store/cartStore", () => ({
  useCartStore: () => ({ addItem: mockAddItem }),
}));

vi.mock("@/src/components/ui/ResponsiveOverlay", () => ({
  ResponsiveOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

vi.mock("@/src/hooks/useAddVoucherToCart", () => ({
  computeVoucherItemPrice: () => ({ drinkPrice: 52_000 }),
}));

import { BundleVoucherSetupSheet } from "@/src/components/shared/BundleVoucherSetupSheet";
import type { MenuData, MenuItem } from "@/src/lib/types/menu";
import type { MyVoucher } from "@/src/services/customerVoucherService";

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mockAddItem.mockReturnValueOnce("qualifier-line").mockReturnValueOnce("reward-line");
});

function makeItem(id: string, category: "latte" | "fusion"): MenuItem {
  return {
    id,
    name: id,
    description: null,
    category,
    unit_price_vnd: null,
    is_seasonal: false,
    image_url: null,
    sort_order: 0,
    base_liquid_note: null,
    custom_powder_grams: null,
    default_base_liquid_id: "liquid-effective",
    resolved_default_base_liquid_id: "liquid-effective",
    allowed_base_liquid_ids: [],
    powder: category === "latte" ? { id: "latte-fixed", name: "Latte fixed", type: "NONE" } : null,
    resolved_default_powder_id: category === "fusion" ? "powder-effective" : undefined,
    allowed_powder_ids: [],
    sizes: [{ size: "MEDIUM", base_price_vnd: 40_000, base_liquid_ml: 200, milk_ml: 200 }],
  } as MenuItem;
}

function makeVoucher(category: "latte" | "fusion"): MyVoucher {
  const itemId = `${category}-item`;
  const scope = {
    menu_item_id: itemId,
    default_powder_id: category === "fusion" ? "powder-effective" : "latte-fixed",
    default_base_liquid_id: "liquid-effective",
    allowed_sizes: ["MEDIUM" as const],
    menu_item: { name: itemId, category, is_available: true },
  };
  return {
    qr_token: `${category}-bundle`,
    voucher_type: "BUNDLE",
    status: "ACTIVE",
    min_order_vnd: null,
    availability: { status: "USABLE", can_apply: true, can_refund: false, refund_points: 0 },
    package: {
      name: "Bundle",
      description: null,
      points_cost: 0,
      bundleRule: {
        buy_quantity: 1,
        reward_quantity: 1,
        reward_kind: "PRODUCT",
        reward_mode: "FIXED_CONFIG",
        benefit_scaling: "PER_BUNDLE",
        max_applications_per_order: 1,
        max_reward_units_per_order: null,
        qualifier_products: [scope],
        reward_products: [scope],
        reward_addon_option_ids: [],
      },
    },
  } as unknown as MyVoucher;
}

function makeMenuData(category: "latte" | "fusion"): MenuData {
  const item = makeItem(`${category}-item`, category);
  return {
    latte: category === "latte" ? [item] : [],
    fusion: category === "fusion" ? [item] : [],
    extras: [],
    milk_types: [{ id: "liquid-effective", name: "Oat", price_per_ml: 1, is_default: true, display_order: 0 }],
    base_liquids: [{ id: "liquid-effective", name: "Oat", price_per_ml: 1, is_default: true, display_order: 0 }],
    addon_groups: [],
    updated_at: "2026-08-22T00:00:00.000Z",
  };
}

describe("Wallet BUNDLE giữ cấu hình effective khi thêm vào giỏ", () => {
  it("ghi powder và Base Liquid effective cho cả qualifier và reward Fusion", async () => {
    const voucher = makeVoucher("fusion");
    const menuData = makeMenuData("fusion");

    render(
      <BundleVoucherSetupSheet
        open
        voucher={voucher}
        menuData={menuData}
        milkTypes={menuData.milk_types}
        powders={[]}
        defaultPowderGram={[]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Thêm vào giỏ và áp ưu đãi" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Thêm vào giỏ và áp ưu đãi" }));

    expect(mockAddItem).toHaveBeenCalledTimes(2);
    for (const [input] of mockAddItem.mock.calls) {
      expect(input).toMatchObject({
        category: "fusion",
        selectedPowderId: "powder-effective",
        selectedBaseLiquidId: "liquid-effective",
      });
    }
  });

  it("Latte giữ Base Liquid nhưng không gửi powder có thể bị hiểu là swap", async () => {
    const voucher = makeVoucher("latte");
    const menuData = makeMenuData("latte");

    render(
      <BundleVoucherSetupSheet
        open
        voucher={voucher}
        menuData={menuData}
        milkTypes={menuData.milk_types}
        powders={[]}
        defaultPowderGram={[]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Thêm vào giỏ và áp ưu đãi" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Thêm vào giỏ và áp ưu đãi" }));

    for (const [input] of mockAddItem.mock.calls) {
      expect(input.selectedPowderId).toBeUndefined();
      expect(input.selectedBaseLiquidId).toBe("liquid-effective");
    }
  });
});
