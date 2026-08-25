import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/hooks/useVoucherAcquisition", () => ({
  useVoucherAcquisition: () => ({ acquire: vi.fn(), isPending: false }),
}));
vi.mock("@/src/components/ui/ResponsiveOverlay", () => ({
  ResponsiveOverlay: ({ open, title, layer = "base", children }: { open: boolean; title: string; layer?: string; children: React.ReactNode }) =>
    open ? <section aria-label={title} data-overlay-layer={layer}>{children}</section> : null,
}));
vi.mock("@/src/components/shared/VoucherDetailSheet", () => ({
  VoucherDetailSheet: ({ voucher, onOpenBundleSetup }: { voucher: { package: { name: string } }; onOpenBundleSetup: (voucher: unknown) => void }) => (
    <div><p>DETAIL:{voucher.package.name}</p><button onClick={() => onOpenBundleSetup(voucher)}>Thiết lập bundle</button></div>
  ),
}));
vi.mock("@/src/components/shared/BundleVoucherSetupSheet", () => ({
  BundleVoucherSetupSheet: ({ voucher, onClose, layer = "base" }: { voucher: { package: { name: string } }; onClose: () => void; layer?: string }) => (
    <div data-overlay-layer={layer}><p>SETUP:{voucher.package.name}</p><button onClick={onClose}>Hủy setup</button></div>
  ),
}));
vi.mock("@/src/components/menu/cart/CartBundleVoucherPanel", () => ({
  CartBundleVoucherPanel: () => <div>LEGACY BUNDLE PANEL</div>,
}));
vi.mock("@/src/components/shared/VoucherPackageCatalog", () => ({ VoucherPackageCatalog: () => <div>PACKAGE CATALOG</div> }));
vi.mock("@/src/components/shared/VoucherAcquisitionConfirm", () => ({ VoucherAcquisitionConfirm: () => null }));
vi.mock("@/src/components/menu/cart/CartDiscountPickerFooter", () => ({ CartDiscountPickerFooter: () => null }));

import { CartDiscountPicker } from "@/src/components/menu/cart/CartDiscountPicker";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import type { CartItem } from "@/src/lib/types/cart";

function makeVoucher(type: MyVoucher["voucher_type"], name: string): MyVoucher {
  return {
    qr_token: name, voucher_type: type, discount_type: null, discount_value: type === "PRODUCT_DISCOUNT" ? 10_000 : null,
    product_discount_mode: type === "PRODUCT_DISCOUNT" ? "FIXED_AMOUNT" : null,
    menu_item_id: type === "PRODUCT_DISCOUNT" ? "missing" : null, eligible_menu_items: [], eligible_sizes: ["MEDIUM"], reference_size: null,
    size: null, matcha_powder_id: null, milk_type_id: null, included_addon_option_ids: [], addon_option_id: null,
    covered_price_vnd: null, covered_delivery_fee_vnd: null, min_order_vnd: null, status: "ACTIVE", used_channel: null,
    expires_at: null, redeemed_at: null, created_at: "2026-08-25T00:00:00.000Z",
    package: { name, description: null, points_cost: 0, bundleRule: type === "BUNDLE" ? {
      buy_quantity: 1, reward_quantity: 1, reward_kind: "PRODUCT", reward_mode: "SAME_CONFIG",
      benefit_scaling: "PER_BUNDLE", max_applications_per_order: 1, max_reward_units_per_order: 1,
      qualifier_products: [], reward_products: [], reward_addon_option_ids: [],
    } : null },
    menuItem: null, addonOption: null, staff: null,
    availability: { status: "USABLE", can_apply: true, can_refund: false, refund_points: 0 },
  } as MyVoucher;
}

const cart: CartItem[] = [{
  cartId: "line", menuItemId: "latte", name: "Latte", category: "latte", imageUrl: null, size: "MEDIUM",
  unitPrice: 50_000, quantity: 1, sweetness: "FULL", iceOption: "NORMAL", coldwhisk: false, note: "",
  selectedOptionIds: [], quantityMap: {}, addonsPrice: 0, addonPrices: {}, quantityAddonOptions: [],
  clientPriceVnd: 50_000, originalClientPriceVnd: 50_000,
}];

const baseProps = {
  discountVouchers: [], freeshipVouchers: [], availableVoucherPackages: [], pointsBalance: 0,
  historyVouchers: [],
  selectedVoucherIds: [], selectedDiscountVouchers: [], selectedFreeshipVouchers: [], subtotalPrice: 50_000,
  orderType: "PICKUP" as const, shippingFee: null, onClose: vi.fn(), onUpdateSelectedVouchers: vi.fn(),
  onRefreshVouchers: vi.fn(async () => undefined), cart,
  menuData: { latte: [], fusion: [], extras: [], milk_types: [], base_liquids: [], addon_groups: [] } as never,
  powders: [], defaultPowderGram: [],
  getProductVoucherBenefit: () => 0, onApplyProductVoucher: vi.fn(), onRemoveProductVoucher: vi.fn(),
  bundleAllocatedCartIds: new Set<string>(), addonLabels: new Map<string, string>(), bundleApplications: [],
  onBundleApplicationChange: vi.fn(() => ({ ok: true as const })), onRequestRemoveBundle: vi.fn(), onAddExtrasReward: vi.fn(() => null),
};

describe("CartDiscountPicker — production wiring", () => {
  it("giữ PRODUCT_DISCOUNT không target để đọc detail và chỉ khóa tick", () => {
    const voucher = makeVoucher("PRODUCT_DISCOUNT", "Giảm món không target");
    render(<CartDiscountPicker {...baseProps} productDiscountVouchers={[voucher]} bundleVouchers={[]} />);
    expect(screen.getByText("Giảm món không target")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chọn voucher" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByText("Giảm món không target"));
    expect(screen.getByText("DETAIL:Giảm món không target")).toBeTruthy();
  });

  it("BUNDLE mở detail/setup cục bộ và không render panel commit trực tiếp", () => {
    const voucher = makeVoucher("BUNDLE", "Mua 1 tặng 1");
    render(<CartDiscountPicker {...baseProps} productDiscountVouchers={[]} bundleVouchers={[voucher]} />);
    expect(screen.queryByText("LEGACY BUNDLE PANEL")).toBeNull();
    fireEvent.click(screen.getByText("Mua 1 tặng 1"));
    fireEvent.click(screen.getByRole("button", { name: "Thiết lập bundle" }));
    expect(screen.getByText("SETUP:Mua 1 tặng 1")).toBeTruthy();
    expect(screen.getByText("SETUP:Mua 1 tặng 1").parentElement?.getAttribute("data-overlay-layer")).toBe("critical");
    fireEvent.click(screen.getByRole("button", { name: "Hủy setup" }));
    expect(screen.queryByText("SETUP:Mua 1 tặng 1")).toBeNull();
    expect(baseProps.onBundleApplicationChange).not.toHaveBeenCalled();
  });

  it("một target áp ngay, nhiều target mở sheet chọn, selected tick thì gỡ", () => {
    const voucher = makeVoucher("PRODUCT_DISCOUNT", "Giảm Latte");
    voucher.menu_item_id = "latte";
    const onApply = vi.fn();
    const { unmount } = render(<CartDiscountPicker {...baseProps} productDiscountVouchers={[voucher]} bundleVouchers={[]}
      getProductVoucherBenefit={() => 10_000} onApplyProductVoucher={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "Chọn voucher" }));
    expect(onApply).toHaveBeenCalledWith("line", voucher);
    unmount();

    const secondLine = { ...cart[0]!, cartId: "line-2" };
    render(<CartDiscountPicker {...baseProps} cart={[...cart, secondLine]} productDiscountVouchers={[voucher]} bundleVouchers={[]}
      getProductVoucherBenefit={() => 10_000} onApplyProductVoucher={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "Chọn voucher" }));
    expect(screen.getByRole("region", { name: "Chọn món áp dụng" }).getAttribute("data-overlay-layer")).toBe("critical");
    fireEvent.click(screen.getAllByRole("button", { name: /Latte/i })[0]);
    expect(onApply).toHaveBeenLastCalledWith("line", voucher);
  });

  it("voucher đang chọn vẫn hiển thị và tick gỡ khỏi đúng line", () => {
    const voucher = makeVoucher("PRODUCT_DISCOUNT", "Giảm đã chọn");
    voucher.menu_item_id = "latte";
    const onRemove = vi.fn();
    render(<CartDiscountPicker {...baseProps} cart={[{ ...cart[0]!, productVoucherId: voucher.qr_token }]}
      productDiscountVouchers={[voucher]} bundleVouchers={[]} getProductVoucherBenefit={() => 0}
      onRemoveProductVoucher={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Bỏ chọn voucher" }));
    expect(onRemove).toHaveBeenCalledWith("line");
  });

  it("giữ ACTIVE unavailable PRODUCT_DISCOUNT/BUNDLE để đọc detail nhưng khóa tick", () => {
    const product = makeVoucher("PRODUCT_DISCOUNT", "PD unavailable");
    const bundle = makeVoucher("BUNDLE", "Bundle unavailable");
    product.availability.can_apply = false;
    bundle.availability.can_apply = false;
    render(<CartDiscountPicker {...baseProps} productDiscountVouchers={[product]} bundleVouchers={[bundle]} />);
    expect(screen.getByText("PD unavailable")).toBeTruthy();
    expect(screen.getByText("Bundle unavailable")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Chọn voucher" }).every((button) => button.hasAttribute("disabled"))).toBe(true);
    fireEvent.click(screen.getByText("Bundle unavailable"));
    expect(screen.getByText("DETAIL:Bundle unavailable")).toBeTruthy();
  });

  it("không hiển thị voucher history trong active cart list", () => {
    const product = makeVoucher("PRODUCT_DISCOUNT", "PD history");
    product.status = "REDEEMED";
    render(<CartDiscountPicker {...baseProps} productDiscountVouchers={[product]} bundleVouchers={[]} />);
    expect(screen.queryByText("PD history")).toBeNull();
  });
});

describe("CartDiscountPicker — phân lớp bottom sheet", () => {
  it("xếp picker trên cart và detail trên picker", () => {
    const voucher = makeVoucher("PRODUCT_DISCOUNT", "Voucher phân lớp");
    render(<CartDiscountPicker {...baseProps} productDiscountVouchers={[voucher]} bundleVouchers={[]} />);

    expect(screen.getByRole("region", { name: "Mã ưu đãi" }).getAttribute("data-overlay-layer")).toBe("nested");
    fireEvent.click(screen.getByText("Voucher phân lớp"));
    expect(screen.getByRole("region", { name: "Chi tiết voucher" }).getAttribute("data-overlay-layer")).toBe("critical");
  });
});

describe("CartDiscountPicker — tab voucher dùng chung", () => {
  it("chia voucher của tôi, nhận ưu đãi và lịch sử; history chỉ mở detail", () => {
    const activeVoucher = makeVoucher("PRODUCT_DISCOUNT", "Voucher đang dùng được");
    const historyVoucher = makeVoucher("PRODUCT_DISCOUNT", "Voucher đã hết hạn");
    historyVoucher.status = "EXPIRED";

    render(
      <CartDiscountPicker
        {...baseProps}
        productDiscountVouchers={[activeVoucher]}
        bundleVouchers={[]}
        historyVouchers={[historyVoucher]}
        selectedVoucherIds={[activeVoucher.qr_token]}
      />,
    );

    expect(screen.getByRole("button", { name: /Voucher của tôi/ })).toBeTruthy();
    expect(screen.getByText("Voucher đang dùng được")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Nhận ưu đãi" }));
    expect(screen.getByText("PACKAGE CATALOG")).toBeTruthy();
    expect(screen.queryByText("Voucher đang dùng được")).toBeNull();
    expect(screen.queryByRole("button", { name: "Bỏ tất cả" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Lịch sử" }));
    expect(screen.getByText("Voucher đã hết hạn")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Chọn voucher" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Bỏ tất cả" })).toBeNull();
    fireEvent.click(screen.getByText("Voucher đã hết hạn"));
    expect(screen.getByText("DETAIL:Voucher đã hết hạn")).toBeTruthy();
  });
});
