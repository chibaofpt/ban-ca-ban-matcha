import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/src/hooks/useAddVoucherToCart", () => ({
  useAddVoucherToCart: () => ({ addToCart: vi.fn(), loading: false }),
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

  it("mở được chi tiết hoàn điểm bằng Enter hoặc Space trên card", () => {
    const voucher = makeUnavailableBundle();
    const onClick = vi.fn();
    render(<VoucherCard voucher={voucher} onClick={onClick} />);

    const card = screen.getByRole("button", { name: /Mua 2 tặng 1/i });
    expect(card.getAttribute("tabindex")).toBe("0");
    expect(card.className).toContain("focus-visible:ring-2");

    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
