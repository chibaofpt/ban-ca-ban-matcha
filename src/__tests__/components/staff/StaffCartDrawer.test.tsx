import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StaffCartDrawer } from "@/src/components/staff/StaffCartDrawer";
import type { CartItem } from "@/src/lib/types/cart";
import type { MyVoucher } from "@/src/services/staffVoucherService";

const bundleItem: CartItem = {
  cartId: "line-1", menuItemId: "matcha", name: "Matcha", category: "latte", imageUrl: null,
  size: "MEDIUM", unitPrice: 50_000, quantity: 2, sweetness: "QUARTER", iceOption: "NORMAL",
  coldwhisk: false, note: "", selectedOptionIds: [], quantityMap: {}, addonsPrice: 0, addonPrices: {},
  quantityAddonOptions: [], clientPriceVnd: 50_000, originalClientPriceVnd: 50_000,
};

const bundleVoucher = {
  qr_token: "bundle", voucher_type: "BUNDLE", status: "ACTIVE", min_order_vnd: null,
  availability: { status: "USABLE", can_apply: true, can_refund: false, refund_points: 0 },
  package: {
    name: "Bundle", bundleRule: {
      buy_quantity: 1, reward_quantity: 1, reward_kind: "PRODUCT", reward_mode: "SAME_CONFIG",
      benefit_scaling: "PER_BUNDLE", max_applications_per_order: 1, max_reward_units_per_order: null,
      qualifier_products: [{ menu_item_id: "matcha", allowed_sizes: ["MEDIUM"], default_powder_id: null, default_base_liquid_id: null, menu_item: { name: "Matcha", category: "latte", is_available: true } }],
      reward_products: [], reward_addon_option_ids: [],
    },
  },
} as unknown as MyVoucher;

describe("StaffCartDrawer — chiều cao theo số lượng item", () => {
  it("fit-content với ít item và chỉ giới hạn ở full viewport", () => {
    render(
      <StaffCartDrawer
        isOpen
        cart={[]}
        discountVoucher={null}
        customerInfo={null}
        onClose={vi.fn()}
        onRemove={vi.fn()}
        onChangeQuantity={vi.fn()}
        onCheckout={vi.fn()}
        onOpenCustomerSelect={vi.fn()}
        onClearCustomer={vi.fn()}
        bundleApplications={[]}
        onBundleApplicationChange={vi.fn()}
        onRequestRemoveBundle={vi.fn()}
      />,
    );

    const sheet = screen.getByTestId("staff-cart-sheet");
    const items = screen.getByTestId("staff-cart-items");
    expect(sheet.className).toContain("h-auto");
    expect(sheet.className).toContain("max-h-[100dvh]");
    expect(items.className).toContain("flex-[0_1_auto]");
  });

  it("mở card BUNDLE của staff chỉ chuyển allowedSizes đúng qualifier", () => {
    const onEditItem = vi.fn();
    render(
      <StaffCartDrawer
        menuData={{ latte: [{ id: "matcha", name: "Matcha", category: "latte", image_url: null, sizes: [] }], fusion: [], extras: [], milk_types: [], addon_groups: [] } as never}
        isOpen
        cart={[bundleItem]}
        discountVoucher={null}
        customerInfo={{ type: "existing", data: { qr_token: "customer", name: "Khách", phone_number: "+8490", points_balance: 0 } }}
        onClose={vi.fn()}
        onRemove={vi.fn()}
        onEditItem={onEditItem}
        onChangeQuantity={vi.fn()}
        onCheckout={vi.fn()}
        onOpenCustomerSelect={vi.fn()}
        onClearCustomer={vi.fn()}
        bundleApplications={[{
          voucher_qr_token: "bundle", owner_key: "staff:customer",
          qualifier_allocations: [{ client_line_id: "line-1", quantity: 1 }],
          reward_allocations: [{ client_line_id: "line-1", quantity: 1 }],
          created_reward_effects: [],
        }]}
        onBundleApplicationChange={vi.fn()}
        onRequestRemoveBundle={vi.fn()}
        customerVouchers={[bundleVoucher]}
      />,
    );

    fireEvent.click(screen.getByText("Matcha", { selector: "h4" }));
    expect(onEditItem).toHaveBeenCalledWith(bundleItem, ["MEDIUM"]);
    expect(screen.getByText("50.000đ")).toBeTruthy();
  });

  it("giao scope của hai BUNDLE cùng line và hiển thị hai badge allocation", () => {
    const onEditItem = vi.fn();
    const bundleA = {
      ...bundleVoucher,
      qr_token: "bundle-a",
      package: { ...bundleVoucher.package, name: "Bundle A", bundleRule: { ...bundleVoucher.package.bundleRule!, qualifier_products: [{ ...bundleVoucher.package.bundleRule!.qualifier_products[0]!, allowed_sizes: ["SMALL", "MEDIUM"] }] } },
    } as MyVoucher;
    const bundleB = {
      ...bundleVoucher,
      qr_token: "bundle-b",
      package: { ...bundleVoucher.package, name: "Bundle B", bundleRule: { ...bundleVoucher.package.bundleRule!, qualifier_products: [{ ...bundleVoucher.package.bundleRule!.qualifier_products[0]!, allowed_sizes: ["MEDIUM", "LARGE"] }] } },
    } as MyVoucher;
    render(
      <StaffCartDrawer
        menuData={{ latte: [{ id: "matcha", name: "Matcha", category: "latte", image_url: null, sizes: [] }], fusion: [], extras: [], milk_types: [], addon_groups: [] } as never}
        isOpen cart={[{ ...bundleItem, quantity: 4 }]} discountVoucher={null}
        customerInfo={{ type: "existing", data: { qr_token: "customer", name: "Khách", phone_number: "+8490", points_balance: 0 } }}
        onClose={vi.fn()} onRemove={vi.fn()} onEditItem={onEditItem} onChangeQuantity={vi.fn()} onCheckout={vi.fn()} onOpenCustomerSelect={vi.fn()} onClearCustomer={vi.fn()}
        bundleApplications={["bundle-a", "bundle-b"].map((voucher_qr_token) => ({
          voucher_qr_token, owner_key: "staff:customer", qualifier_allocations: [{ client_line_id: "line-1", quantity: 1 }], reward_allocations: [{ client_line_id: "line-1", quantity: 1 }], created_reward_effects: [],
        }))}
        onBundleApplicationChange={vi.fn()} onRequestRemoveBundle={vi.fn()} customerVouchers={[bundleA, bundleB]}
      />,
    );

    fireEvent.click(screen.getByText("Matcha", { selector: "h4" }));
    expect(onEditItem).toHaveBeenCalledWith(expect.objectContaining({ cartId: "line-1" }), ["MEDIUM"]);
    expect(screen.getByText("Bundle A: 2 phần")).toBeTruthy();
    expect(screen.getByText("Bundle B: 2 phần")).toBeTruthy();
  });
});
