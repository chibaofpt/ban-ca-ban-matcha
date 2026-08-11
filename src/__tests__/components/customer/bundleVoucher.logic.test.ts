import { describe, expect, it } from "vitest";
import {
  deriveBundleSelectionState,
  formatBundleBenefit,
  setBundleAllocationQuantity,
  type BundleCartSummaryItem,
  type BundleVoucherSummary,
} from "@/src/lib/utils/bundleVoucher";

const VOUCHER: BundleVoucherSummary = {
  qr_token: "11111111-1111-4111-8111-111111111111",
  buy_quantity: 2,
  reward_quantity: 1,
  reward_kind: "PRODUCT",
  reward_mode: "SAME_CONFIG",
  benefit_scaling: "PER_BUNDLE",
  max_applications_per_order: 2,
  max_reward_units_per_order: null,
  eligible_menu_item_ids: ["latte-1"],
  reward_menu_item_ids: ["latte-1"],
};

const CART: BundleCartSummaryItem[] = [
  { client_line_id: "line-1", menu_item_id: "latte-1", quantity: 3 },
];

describe("Helper chọn BUNDLE dùng chung", () => {
  it("format nhãn mua X tặng Y sản phẩm", () => {
    expect(formatBundleBenefit(VOUCHER)).toBe("Mua 2 tặng 1 món");
  });

  it("format nhãn addon trên mỗi món", () => {
    expect(
      formatBundleBenefit({
        ...VOUCHER,
        reward_kind: "ADDON",
        reward_quantity: 2,
        benefit_scaling: "PER_QUALIFYING_ITEM",
      }),
    ).toBe("Mua từ 2 món, tặng 2 addon trên mỗi món");
  });

  it("báo thiếu món mua khi giỏ chưa đạt điều kiện", () => {
    const state = deriveBundleSelectionState({
      voucher: VOUCHER,
      cart: [{ ...CART[0]!, quantity: 1 }],
      allocations: [],
    });
    expect(state).toEqual({ status: "INELIGIBLE", message: "Cần thêm 1 món đủ điều kiện" });
  });

  it("báo cần chọn quà khi đã đủ món nhưng chưa allocation", () => {
    const state = deriveBundleSelectionState({ voucher: VOUCHER, cart: CART, allocations: [] });
    expect(state).toEqual({ status: "NEEDS_REWARD", message: "Chọn 1 món quà" });
  });

  it("báo sẵn sàng khi giỏ và allocation hợp lệ", () => {
    const state = deriveBundleSelectionState({
      voucher: VOUCHER,
      cart: CART,
      allocations: [{ client_line_id: "line-1", quantity: 1 }],
    });
    expect(state).toEqual({ status: "READY", message: "Đã áp dụng mua 2 tặng 1 món" });
  });

  it("đánh dấu cần chọn lại khi cart line của quà đã bị xóa", () => {
    const state = deriveBundleSelectionState({
      voucher: VOUCHER,
      cart: [],
      allocations: [{ client_line_id: "line-1", quantity: 1 }],
    });
    expect(state).toEqual({ status: "STALE", message: "Giỏ đã thay đổi, vui lòng chọn lại quà" });
  });

  it("chưa sẵn sàng khi chọn thiếu số lượng quà của một nhóm", () => {
    const state = deriveBundleSelectionState({
      voucher: { ...VOUCHER, reward_quantity: 2 },
      cart: [{ ...CART[0]!, quantity: 4 }],
      allocations: [{ client_line_id: "line-1", quantity: 1 }],
    });
    expect(state.status).toBe("NEEDS_REWARD");
  });

  it("chưa sẵn sàng khi số nhóm quà vượt giới hạn mỗi đơn", () => {
    const state = deriveBundleSelectionState({
      voucher: { ...VOUCHER, max_applications_per_order: 1 },
      cart: [{ ...CART[0]!, quantity: 4 }],
      allocations: [{ client_line_id: "line-1", quantity: 2 }],
    });
    expect(state.status).toBe("NEEDS_REWARD");
  });

  it("addon PER_QUALIFYING_ITEM yêu cầu đủ quà theo từng món mua", () => {
    const state = deriveBundleSelectionState({
      voucher: {
        ...VOUCHER,
        reward_kind: "ADDON",
        reward_mode: "ALLOWED_SCOPE",
        benefit_scaling: "PER_QUALIFYING_ITEM",
        reward_quantity: 2,
      },
      cart: [{ ...CART[0]!, quantity: 2 }],
      allocations: [{ client_line_id: "line-1", addon_option_id: "addon-1", quantity: 2 }],
    });
    expect(state.status).toBe("NEEDS_REWARD");
  });

  it("cập nhật số lượng trên đúng một reward target và xoá khi về 0", () => {
    const first = setBundleAllocationQuantity(
      [],
      { client_line_id: "line-1", addon_option_id: "addon-1" },
      2,
    );
    expect(first).toEqual([
      { client_line_id: "line-1", addon_option_id: "addon-1", quantity: 2 },
    ]);
    expect(
      setBundleAllocationQuantity(
        first,
        { client_line_id: "line-1", addon_option_id: "addon-1" },
        0,
      ),
    ).toEqual([]);
  });
});
