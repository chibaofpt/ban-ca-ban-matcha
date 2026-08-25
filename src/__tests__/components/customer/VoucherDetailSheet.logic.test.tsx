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
import type { MyVoucher } from "@/src/services/customerVoucherService";

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
});
