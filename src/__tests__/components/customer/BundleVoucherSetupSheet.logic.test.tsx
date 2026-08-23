import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockAddItem } = vi.hoisted(() => ({ mockAddItem: vi.fn() }));

vi.mock("@/src/lib/store/cartStore", () => ({
  useCartStore: () => ({ addItem: mockAddItem }),
}));

vi.mock("@/src/components/ui/ResponsiveOverlay", () => ({
  ResponsiveOverlay: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-testid="overlay" data-title={title}>
      {children}
    </div>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

vi.mock("@/src/hooks/useAddVoucherToCart", () => ({
  computeVoucherItemPrice: () => ({ drinkPrice: 52_000 }),
}));

// Mock ProductModal — renders a button that calls onConfirm with a stub CartItem
vi.mock("@/src/components/shared/ProductModal", () => ({
  default: ({
    onConfirm,
    item,
  }: {
    onConfirm?: (item: unknown) => void;
    item: { id: string; category: string };
  }) => (
    <button
      data-testid="mock-product-modal-confirm"
      onClick={() =>
        onConfirm?.({
          cartId: "pending",
          menuItemId: item.id,
          name: item.id,
          category: item.category,
          imageUrl: null,
          size: "MEDIUM",
          unitPrice: 52_000,
          quantity: 1,
          sweetness: "QUARTER",
          iceOption: "NORMAL",
          coldwhisk: false,
          note: "",
          selectedOptionIds: [],
          quantityMap: {},
          addonsPrice: 0,
          addonPrices: {},
          quantityAddonOptions: [],
          clientPriceVnd: 52_000,
          originalClientPriceVnd: 52_000,
          selectedBaseLiquidId: "liquid-effective",
          selectedPowderId: item.category === "fusion" ? "powder-effective" : undefined,
        })
      }
    >
      Chọn món này
    </button>
  ),
}));

import { BundleVoucherSetupSheet } from "@/src/components/shared/BundleVoucherSetupSheet";
import type { MenuData, MenuItem } from "@/src/lib/types/menu";
import type { MyVoucher } from "@/src/services/customerVoucherService";

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mockAddItem
    .mockReturnValueOnce("qualifier-line")
    .mockReturnValueOnce("reward-line");
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

function makeVoucher(overrides: {
  category: "latte" | "fusion";
  reward_mode?: "SAME_CONFIG" | "FIXED_CONFIG" | "ALLOWED_SCOPE";
  buy_quantity?: number;
  reward_quantity?: number;
}): MyVoucher {
  const { category, reward_mode = "FIXED_CONFIG", buy_quantity = 1, reward_quantity = 1 } = overrides;
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
        buy_quantity,
        reward_quantity,
        reward_kind: "PRODUCT",
        reward_mode,
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

describe("BundleVoucherSetupSheet — slot-based flow", () => {
  it("CTA 'Sử dụng' bị disabled khi chưa chọn đủ món qualifier", () => {
    render(
      <BundleVoucherSetupSheet
        open
        voucher={makeVoucher({ category: "fusion" })}
        menuData={makeMenuData("fusion")}
        milkTypes={makeMenuData("fusion").milk_types}
        powders={[]}
        defaultPowderGram={[]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    const cta = screen.getByRole("button", { name: /sử dụng/i });
    expect(cta.hasAttribute("disabled")).toBe(true);
  });

  it("hiển thị slot trống 'Thêm món' khi mở lần đầu", () => {
    render(
      <BundleVoucherSetupSheet
        open
        voucher={makeVoucher({ category: "latte" })}
        menuData={makeMenuData("latte")}
        milkTypes={makeMenuData("latte").milk_types}
        powders={[]}
        defaultPowderGram={[]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getAllByText("Thêm món").length).toBeGreaterThan(0);
  });

  it("mở pick sub-view khi bấm slot trống — thay đổi overlay title thành 'Chọn món mua'", async () => {
    render(
      <BundleVoucherSetupSheet
        open
        voucher={makeVoucher({ category: "fusion" })}
        menuData={makeMenuData("fusion")}
        milkTypes={makeMenuData("fusion").milk_types}
        powders={[]}
        defaultPowderGram={[]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getAllByText("Thêm món")[0]);

    await waitFor(() => {
      const overlay = screen.getByTestId("overlay");
      expect(overlay.getAttribute("data-title")).toBe("Chọn món mua");
    });
  });

  it("SAME_CONFIG — không hiển thị section 'Món tặng' riêng, có badge 'cùng loại'", () => {
    render(
      <BundleVoucherSetupSheet
        open
        voucher={makeVoucher({ category: "fusion", reward_mode: "SAME_CONFIG" })}
        menuData={makeMenuData("fusion")}
        milkTypes={makeMenuData("fusion").milk_types}
        powders={[]}
        defaultPowderGram={[]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Món tặng/i)).toBeNull();
    expect(screen.getByText(/cùng loại với món đã chọn/i)).toBeTruthy();
  });

  it("FIXED_CONFIG — hiển thị cả section qualifier và reward", () => {
    render(
      <BundleVoucherSetupSheet
        open
        voucher={makeVoucher({ category: "fusion", reward_mode: "FIXED_CONFIG" })}
        menuData={makeMenuData("fusion")}
        milkTypes={makeMenuData("fusion").milk_types}
        powders={[]}
        defaultPowderGram={[]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByText(/Món mua/i)).toBeTruthy();
    expect(screen.getByText(/Món tặng/i)).toBeTruthy();
  });

  it("SAME_CONFIG: sau khi chọn 1 món qua ProductModal, CTA enabled và addItem ghi đúng config Fusion", async () => {
    const onSuccess = vi.fn();

    render(
      <BundleVoucherSetupSheet
        open
        voucher={makeVoucher({ category: "fusion", reward_mode: "SAME_CONFIG", buy_quantity: 1 })}
        menuData={makeMenuData("fusion")}
        milkTypes={makeMenuData("fusion").milk_types}
        powders={[]}
        defaultPowderGram={[]}
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    // Click empty qualifier slot → pick view
    await act(async () => {
      fireEvent.click(screen.getAllByText("Thêm món")[0]);
    });

    // Pick the scope item from list
    await waitFor(() => {
      expect(screen.getByTestId("overlay").getAttribute("data-title")).toBe("Chọn món mua");
    });
    // The scope item name is "fusion-item"
    const scopeItems = screen.queryAllByText("fusion-item");
    expect(scopeItems.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(scopeItems[0]);
    });

    // ProductModal shows → click "Chọn món này" to fill qualifier slot
    await waitFor(() => {
      expect(screen.queryByTestId("mock-product-modal-confirm")).not.toBeNull();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("mock-product-modal-confirm"));
    });

    // CTA should be enabled now
    await waitFor(() => {
      const cta = screen.getByRole("button", { name: /sử dụng/i });
      expect(cta.hasAttribute("disabled")).toBe(false);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sử dụng/i }));
    });

    expect(mockAddItem).toHaveBeenCalledTimes(1);
    const [input] = mockAddItem.mock.calls[0];
    expect(input).toMatchObject({
      category: "fusion",
      selectedPowderId: "powder-effective",
      selectedBaseLiquidId: "liquid-effective",
    });
    expect(onSuccess).toHaveBeenCalledWith("fusion-bundle", [
      { client_line_id: "qualifier-line", quantity: 1 },
    ]);
  });
});
