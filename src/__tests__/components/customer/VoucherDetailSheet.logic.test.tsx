import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { addToCart } = vi.hoisted(() => ({ addToCart: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/src/hooks/useAddVoucherToCart", () => ({
  useAddVoucherToCart: () => ({ addToCart, loading: false }),
}));

import { VoucherDetailSheet } from "@/src/components/shared/VoucherDetailSheet";
import { VoucherCard } from "@/src/components/shared/VoucherCards";
import type { MyVoucher, VoucherPackage } from "@/src/services/customerVoucherService";

afterEach(cleanup);

function makeUnavailableBundle(): MyVoucher {
  return {
    qr_token: "bundle-unavailable",
    voucher_type: "BUNDLE",
    discount_type: null,
    discount_value: null,
    menu_item_id: null,
    size: null,
    matcha_powder_id: null,
    milk_type_id: null,
    included_addon_option_ids: [],
    addon_option_id: null,
    covered_price_vnd: null,
    covered_delivery_fee_vnd: null,
    min_order_vnd: null,
    status: "ACTIVE",
    used_channel: null,
    expires_at: null,
    redeemed_at: null,
    created_at: "2026-08-22T00:00:00.000Z",
    package: {
      name: "Mua 2 tặng 1",
      description: null,
      points_cost: 80,
      acquisition_mode: "POINTS_EXCHANGE",
      bundleRule: null,
    },
    menuItem: null,
    addonOption: null,
    staff: null,
    availability: {
      status: "NO_ACTIVE_REWARD",
      can_apply: false,
      can_refund: true,
      refund_points: 80,
    },
  };
}

describe("Chi tiết voucher không còn lựa chọn", () => {
  it("khóa dùng ngay PRODUCT_DISCOUNT khi menuData chưa resolve", async () => {
    const voucher = {
      ...makeUnavailableBundle(),
      qr_token: "product-discount",
      voucher_type: "PRODUCT_DISCOUNT",
      menu_item_id: "drink-1",
      product_discount_mode: "PAY_AS_SIZE",
      eligible_sizes: ["LARGE"],
      reference_size: "MEDIUM",
      availability: { status: "USABLE", can_apply: true, can_refund: false, refund_points: 0 },
    } as MyVoucher;
    const onUseNowSuccess = vi.fn();
    addToCart.mockClear();
    render(
      <VoucherDetailSheet voucher={voucher} cartItems={[]} subtotalVnd={0} myVouchers={[voucher]}
        orderType="PICKUP" shippingFee={null} onBack={vi.fn()} onUseNowSuccess={onUseNowSuccess}
        onOpenBundleSetup={vi.fn()} onRequestRefund={vi.fn()} isRefunding={false} />,
    );

    const button = screen.getByRole("button", { name: "Dùng ngay" });
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(button);
    expect(addToCart).not.toHaveBeenCalled();
    expect(onUseNowSuccess).not.toHaveBeenCalled();
  });

  it("chỉ one-tap sau khi resolve đúng một tổ hợp sản phẩm và size", async () => {
    const voucher = {
      ...makeUnavailableBundle(), qr_token: "single-combination", voucher_type: "PRODUCT_DISCOUNT",
      menu_item_id: "drink-1", eligible_menu_items: [{ menu_item_id: "drink-1", name: "Latte", category: "latte", is_available: true, is_seasonal: false }],
      product_discount_mode: "FIXED_AMOUNT", eligible_sizes: ["MEDIUM"], reference_size: null,
      availability: { status: "USABLE", can_apply: true, can_refund: false, refund_points: 0 },
    } as MyVoucher;
    addToCart.mockClear();
    addToCart.mockResolvedValueOnce({ ok: true });
    render(<VoucherDetailSheet voucher={voucher} cartItems={[]} subtotalVnd={0} myVouchers={[voucher]}
      orderType="PICKUP" shippingFee={null} menuData={{ latte: [{ id: "drink-1", name: "Latte", sizes: [{ size: "MEDIUM", base_price_vnd: 50_000 }] }], fusion: [] } as never}
      onBack={vi.fn()} onUseNowSuccess={vi.fn()} onOpenBundleSetup={vi.fn()} onRequestRefund={vi.fn()} isRefunding={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Dùng ngay" }));
    expect(addToCart).toHaveBeenCalledWith(voucher, { menuItemId: "drink-1", size: "MEDIUM" });
  });

  it("khóa áp dụng, giải thích lý do và cho yêu cầu hoàn đúng số điểm", () => {
    const voucher = makeUnavailableBundle();
    const onRequestRefund = vi.fn();

    render(
      <VoucherDetailSheet
        voucher={voucher}
        cartItems={[]}
        subtotalVnd={0}
        myVouchers={[voucher]}
        orderType="PICKUP"
        shippingFee={null}
        onBack={vi.fn()}
        onUseNowSuccess={vi.fn()}
        onOpenBundleSetup={vi.fn()}
        onRequestRefund={onRequestRefund}
        isRefunding={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Chọn món cho ưu đãi" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByText("Quà tặng hiện không còn phục vụ.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hoàn 80 điểm" }));
    expect(onRequestRefund).toHaveBeenCalledWith(voucher);
  });

  it("dùng semantic button để mở chi tiết bằng bàn phím", () => {
    const voucher = makeUnavailableBundle();
    const onClick = vi.fn();
    render(<VoucherCard voucher={voucher} onClick={onClick} />);

    const card = screen.getByRole("button", { name: /Xem chi tiết Mua 2 tặng 1/i });
    expect(card.tagName).toBe("BUTTON");
    expect(card.className).toContain("focus-visible:ring-2");

    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("voucher đang áp hiển thị nút hủy màu đỏ và gọi đúng action", () => {
    const voucher = makeUnavailableBundle();
    const onRemoveAppliedVoucher = vi.fn();
    render(
      <VoucherDetailSheet
        voucher={voucher}
        cartItems={[]}
        subtotalVnd={0}
        myVouchers={[voucher]}
        orderType="PICKUP"
        shippingFee={null}
        onBack={vi.fn()}
        onUseNowSuccess={vi.fn()}
        onOpenBundleSetup={vi.fn()}
        onRequestRefund={vi.fn()}
        isRefunding={false}
        onRemoveAppliedVoucher={onRemoveAppliedVoucher}
      />,
    );

    const removeButton = screen.getByRole("button", { name: "Hủy voucher" });
    expect(removeButton.className).toContain("text-destructive");
    fireEvent.click(removeButton);
    expect(onRemoveAppliedVoucher).toHaveBeenCalledOnce();
  });
});

function makePackage(overrides: Partial<VoucherPackage> = {}): VoucherPackage {
  return {
    id: "package-1", name: "Giảm 20K", description: "Ưu đãi riêng của package", voucher_type: "DISCOUNT",
    acquisition_mode: "POINTS_EXCHANGE", points_cost: 40, discount_type: "FIXED", discount_value: 20_000,
    menu_item_id: null, size: null, matcha_powder_id: null, milk_type_id: null,
    included_addon_option_ids: [], addon_option_id: null, covered_price_vnd: null,
    covered_delivery_fee_vnd: null, min_order_vnd: 100_000, is_active: true, expires_after_days: null,
    quantity: 10, remaining_quantity: 10, max_per_user: 1, user_redeemed_count: 0,
    created_at: "2026-09-01T00:00:00.000Z", ...overrides,
  };
}

describe("Chi tiết package dùng dữ liệu catalog và footer theo trạng thái", () => {
  it("hiển thị đúng loại, mô tả, hạn và điều kiện mà không cần dummy voucher", () => {
    render(<VoucherDetailSheet packageData={makePackage()} points={100} isLoggedIn isExchanging={false} onBack={vi.fn()} onExchange={vi.fn()} />);
    expect(screen.getByText("Giảm giá")).toBeTruthy();
    expect(screen.getByText("Ưu đãi riêng của package")).toBeTruthy();
    expect(screen.getByText("Vô thời hạn")).toBeTruthy();
    expect(screen.getByText("Giá trị đơn tối thiểu: 100.000đ")).toBeTruthy();
  });

  it.each([
    [makePackage(), 100, false, "Đăng nhập để nhận ưu đãi", null],
    [makePackage({ acquisition_mode: "FREE_CLAIM", points_cost: 0 }), 0, true, "Nhận miễn phí", null],
    [makePackage(), 100, true, "Đổi 40 🐟", null],
    [makePackage(), 10, true, "Đổi 40 🐟", "Bạn cần thêm 30 🐟 để đổi ưu đãi này."],
    [makePackage({ remaining_quantity: 0 }), 100, true, "Đổi 40 🐟", "Gói ưu đãi đã hết số lượng."],
    [makePackage({ user_redeemed_count: 1 }), 100, true, "Đổi 40 🐟", "Bạn đã nhận đủ số lượt cho phép của gói này."],
    [makePackage({ acquisition_mode: "AUTO_GRANT", points_cost: 0 }), 0, true, "Được cấp tự động", "Ưu đãi này được tự động thêm khi bạn đủ điều kiện."],
  ])("render footer package %#", (pkg, points, loggedIn, buttonName, explanation) => {
    render(<VoucherDetailSheet packageData={pkg} points={points} isLoggedIn={loggedIn} isExchanging={false} onBack={vi.fn()} onExchange={vi.fn()} onLogin={vi.fn()} />);
    expect(screen.getByRole("button", { name: buttonName })).toBeTruthy();
    if (explanation) expect(screen.getByText(explanation)).toBeTruthy();
    cleanup();
  });

  it("khóa busy và giải thích khi callback phù hợp bị thiếu", () => {
    const { rerender } = render(<VoucherDetailSheet packageData={makePackage()} points={100} isLoggedIn isExchanging onBack={vi.fn()} onExchange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Đổi 40/ }).getAttribute("aria-busy")).toBe("true");
    rerender(<VoucherDetailSheet packageData={makePackage()} points={100} isLoggedIn isExchanging={false} onBack={vi.fn()} />);
    expect(screen.getByText("Tạm thời chưa thể thực hiện.")).toBeTruthy();
  });
});
