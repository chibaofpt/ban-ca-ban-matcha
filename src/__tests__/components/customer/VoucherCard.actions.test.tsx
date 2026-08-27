import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VoucherCard } from "@/src/components/shared/VoucherCards";
import type { MyVoucher } from "@/src/services/customerVoucherService";

const voucher = {
  qr_token: "voucher",
  voucher_type: "DISCOUNT",
  discount_type: "FIXED",
  discount_value: 10_000,
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
  created_at: "2026-08-25T00:00:00.000Z",
  package: { name: "Giảm 10K", description: null, points_cost: 0 },
  menuItem: null,
  addonOption: null,
  staff: null,
  availability: { status: "USABLE", can_apply: true, can_refund: false, refund_points: 0 },
} as MyVoucher;

describe("VoucherCard — nội dung và action độc lập", () => {
  it("card bị dim vẫn mở detail nhưng tick bị khóa và có lý do", () => {
    const onOpen = vi.fn();
    const onAction = vi.fn();
    render(
      <VoucherCard
        voucher={voucher}
        isDisabled
        disabledReason="Chưa đủ điều kiện"
        onClick={onOpen}
        onAction={onAction}
        actionModel={{ kind: "selection", selected: false, disabled: true, reason: "Chưa đủ điều kiện" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Xem chi tiết Giảm 10K" }));
    expect(onOpen).toHaveBeenCalledOnce();
    const tick = screen.getByRole("button", { name: "Chọn voucher" });
    expect(tick.hasAttribute("disabled")).toBe(true);
    expect(tick.getAttribute("title")).toBe("Chưa đủ điều kiện");
    expect(onAction).not.toHaveBeenCalled();
  });

  it("wallet hiển thị nút Dùng ngay riêng và không mở detail khi bấm action", () => {
    const onOpen = vi.fn();
    const onUseNow = vi.fn();
    render(
      <VoucherCard
        voucher={voucher}
        onClick={onOpen}
        onAction={onUseNow}
        actionModel={{ kind: "use-now", label: "Dùng ngay", disabled: false, busy: false }}
      />,
    );

    fireEvent.click(screen.getByText("Giảm 10K"));
    expect(onOpen).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Dùng ngay" }));
    expect(onUseNow).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("nút chọn nằm trên lớp mở detail và vòng tròn hiển thị lớn hơn", () => {
    render(
      <VoucherCard
        voucher={voucher}
        onClick={vi.fn()}
        onAction={vi.fn()}
        actionModel={{ kind: "selection", selected: false, disabled: false }}
      />,
    );

    const action = screen.getByRole("button", { name: "Chọn voucher" });
    expect(action.closest(".z-10")).toBeNull();
    expect(action.querySelector("span")?.className).toContain("h-6");
    expect(action.querySelector("span")?.className).toContain("w-6");
  });
});
