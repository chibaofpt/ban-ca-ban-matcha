import { describe, expect, it } from "vitest";
import {
  deriveBundleSelectionState,
  deriveBundleAllocationConstraints,
  buildBundleApplication,
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
  eligible_products: [{ menu_item_id: "latte-1", allowed_sizes: ["SMALL", "MEDIUM", "LARGE"] }],
  reward_products: [{ menu_item_id: "latte-1", allowed_sizes: ["SMALL", "MEDIUM", "LARGE"] }],
  min_order_vnd: null,
};

const CART: BundleCartSummaryItem[] = [
  {
    client_line_id: "line-1", menu_item_id: "latte-1", label: "Matcha Latte",
    size: "SMALL", quantity: 3, unit_price_vnd: 45_000, product_voucher_quantity: 0, addons: [],
  },
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

  it("không tính món đã dùng voucher sản phẩm vào X", () => {
    const state = deriveBundleSelectionState({
      voucher: VOUCHER,
      cart: [{ ...CART[0]!, quantity: 2, product_voucher_quantity: 1 }],
      allocations: [],
    });
    expect(state).toEqual({
      status: "INELIGIBLE",
      message: "Matcha Latte đang dùng voucher sản phẩm nên không được tính; cần thêm 1 món đủ điều kiện",
    });
  });

  it("kiểm tra đơn tối thiểu trên phần sản phẩm hợp lệ sau voucher cá nhân", () => {
    const state = deriveBundleSelectionState({
      voucher: { ...VOUCHER, min_order_vnd: 100_000 },
      cart: [{
        ...CART[0]!, quantity: 2, unit_price_vnd: 40_000,
        addons: [{ addon_option_id: "addon-1", quantity: 2, unit_price_vnd: 10_000, voucher_discounted_quantity: 1 }],
      }],
      allocations: [],
    });
    expect(state).toEqual({
      status: "INELIGIBLE",
      message: "Cần thêm 10.000đ sản phẩm hợp lệ để đạt giá trị đơn tối thiểu",
    });
  });

  it("báo xung đột nếu món quà đã dùng voucher sản phẩm", () => {
    const state = deriveBundleSelectionState({
      voucher: VOUCHER,
      cart: [{ ...CART[0]!, product_voucher_quantity: 1 }],
      allocations: [{ client_line_id: "line-1", quantity: 3 }],
    });
    expect(state.status).toBe("CONFLICT");
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
      cart: [{
        ...CART[0]!,
        quantity: 2,
        addons: [{
          addon_option_id: "addon-1", quantity: 4, unit_price_vnd: 10_000,
          voucher_discounted_quantity: 0,
        }],
      }],
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

  it("tạo qualifier allocations không chồng lên product reward", () => {
    expect(buildBundleApplication({
      voucher: VOUCHER,
      cart: CART,
      rewardAllocations: [{ client_line_id: "line-1", quantity: 1 }],
    })).toEqual({
      voucher_qr_token: VOUCHER.qr_token,
      qualifier_allocations: [{ client_line_id: "line-1", quantity: 2 }],
      reward_allocations: [{ client_line_id: "line-1", quantity: 1 }],
    });
  });

  it("không dùng unit đã có PRODUCT voucher làm qualifier", () => {
    const application = buildBundleApplication({
      voucher: { ...VOUCHER, buy_quantity: 1 },
      cart: [{ ...CART[0]!, quantity: 3, product_voucher_quantity: 1 }],
      rewardAllocations: [{ client_line_id: "line-1", quantity: 1 }],
    });
    expect(application?.qualifier_allocations).toEqual([
      { client_line_id: "line-1", quantity: 1 },
    ]);
  });

  it("giao của scope hai BUNDLE trên cùng line chỉ cho phép size chung", () => {
    const first: BundleVoucherSummary = {
      ...VOUCHER,
      qr_token: "bundle-a",
      eligible_products: [{ menu_item_id: "latte-1", allowed_sizes: ["SMALL", "MEDIUM"] }],
    };
    const second: BundleVoucherSummary = {
      ...VOUCHER,
      qr_token: "bundle-b",
      eligible_products: [{ menu_item_id: "latte-1", allowed_sizes: ["MEDIUM", "LARGE"] }],
    };
    const constraints = deriveBundleAllocationConstraints({
      cart: [{ ...CART[0]!, size: "MEDIUM", quantity: 4 }],
      applications: [first, second].map((voucher) => ({
        voucher_qr_token: voucher.qr_token,
        voucher,
        qualifier_allocations: [{ client_line_id: "line-1", quantity: 1 }],
        reward_allocations: [{ client_line_id: "line-1", quantity: 1 }],
      })),
    });

    expect(constraints.allowed_sizes_by_line.get("line-1")).toEqual(["MEDIUM"]);
    expect(constraints.non_editable_line_ids.has("line-1")).toBe(false);
  });

  it("chặn edit khi các BUNDLE trên cùng line không có size chung", () => {
    const constraints = deriveBundleAllocationConstraints({
      cart: [{ ...CART[0]!, size: "SMALL", quantity: 4 }],
      applications: [["bundle-a", ["SMALL"]], ["bundle-b", ["LARGE"]]].map(([token, allowedSizes]) => ({
        voucher_qr_token: token as string,
        voucher: { ...VOUCHER, qr_token: token as string, eligible_products: [{ menu_item_id: "latte-1", allowed_sizes: allowedSizes as ("SMALL" | "MEDIUM" | "LARGE")[] }] },
        qualifier_allocations: [{ client_line_id: "line-1", quantity: 1 }],
        reward_allocations: [{ client_line_id: "line-1", quantity: 1 }],
      })),
    });

    expect(constraints.non_editable_line_ids.has("line-1")).toBe(true);
    expect(constraints.error_by_token.size).toBe(1);
  });
});

describe("buildBundleApplication — edge cases", () => {
  it("phân bổ qualifier qua nhiều cart line khác nhau", () => {
    // line-A: 2 items (both used as qualifiers), line-B: 2 items (1 reward + 1 qualifier)
    // buy_quantity=2 can be satisfied: 2 from line-A, reward from line-B
    const multiLineCart: BundleCartSummaryItem[] = [
      {
        client_line_id: "line-A", menu_item_id: "latte-1", label: "Latte A",
        size: "SMALL", quantity: 2, unit_price_vnd: 45_000, product_voucher_quantity: 0, addons: [],
      },
      {
        client_line_id: "line-B", menu_item_id: "latte-1", label: "Latte B",
        size: "SMALL", quantity: 2, unit_price_vnd: 45_000, product_voucher_quantity: 0, addons: [],
      },
    ];
    // VOUCHER: buy_quantity=2, reward_quantity=1, SAME_CONFIG
    // Reward from line-B; qualifiers should span line-A (2 from line-A satisfies buy_quantity=2)
    const result = buildBundleApplication({
      voucher: VOUCHER,
      cart: multiLineCart,
      rewardAllocations: [{ client_line_id: "line-B", quantity: 1 }],
    });
    expect(result).not.toBeNull();
    const qualTotal = result!.qualifier_allocations.reduce((s, a) => s + a.quantity, 0);
    expect(qualTotal).toBe(2); // 2 qualifiers needed for buy_quantity=2
    // reward units on line-B must not be double counted in qualifiers
    const qualOnB = result!.qualifier_allocations.find(a => a.client_line_id === "line-B")?.quantity ?? 0;
    const rewardOnB = result!.reward_allocations.find(a => a.client_line_id === "line-B")?.quantity ?? 0;
    const lineB = multiLineCart.find(c => c.client_line_id === "line-B")!;
    expect(qualOnB + rewardOnB).toBeLessThanOrEqual(lineB.quantity);
  });

  it("buildBundleApplication cho ADDON reward gán đúng addon_option_id", () => {
    const addonCart: BundleCartSummaryItem[] = [{
      client_line_id: "line-1", menu_item_id: "latte-1", label: "Latte",
      size: "SMALL", quantity: 2, unit_price_vnd: 45_000, product_voucher_quantity: 0,
      addons: [{ addon_option_id: "addon-jelly", quantity: 2, unit_price_vnd: 10_000, voucher_discounted_quantity: 0 }],
    }];
    const addonVoucher: BundleVoucherSummary = {
      ...VOUCHER,
      reward_kind: "ADDON",
      reward_mode: "ALLOWED_SCOPE",
      benefit_scaling: "PER_BUNDLE",
      buy_quantity: 2,
      reward_quantity: 1,
      max_applications_per_order: 1,
      max_reward_units_per_order: null,
    };
    const result = buildBundleApplication({
      voucher: addonVoucher,
      cart: addonCart,
      rewardAllocations: [{ client_line_id: "line-1", addon_option_id: "addon-jelly", quantity: 1 }],
    });
    expect(result).not.toBeNull();
    expect(result!.reward_allocations).toEqual([{
      client_line_id: "line-1",
      addon_option_id: "addon-jelly",
      quantity: 1,
    }]);
    expect(result!.qualifier_allocations[0]).toMatchObject({ client_line_id: "line-1" });
  });

  it("max_reward_units_per_order=1 chặn khi allocation vượt giới hạn", () => {
    const state = deriveBundleSelectionState({
      voucher: {
        ...VOUCHER,
        reward_kind: "ADDON",
        reward_mode: "ALLOWED_SCOPE",
        benefit_scaling: "PER_BUNDLE",
        buy_quantity: 2,
        reward_quantity: 1,
        max_applications_per_order: 2,
        max_reward_units_per_order: 1,
      },
      cart: [{
        ...CART[0]!,
        quantity: 4,
        addons: [{ addon_option_id: "addon-jelly", quantity: 4, unit_price_vnd: 10_000, voucher_discounted_quantity: 0 }],
      }],
      allocations: [
        { client_line_id: "line-1", addon_option_id: "addon-jelly", quantity: 2 },
      ],
    });
    expect(state.status).toBe("NEEDS_REWARD");
  });
});
