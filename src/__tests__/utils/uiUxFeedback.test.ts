import { describe, expect, it } from "vitest";
import type { CartItem } from "@/src/lib/types/cart";
import {
  deriveCheckoutRewards,
  getMenuItemCartQuantity,
  groupPointsLogs,
} from "@/src/utils/customerUx";
import {
  formatKa,
  formatOrderSize,
  formatVietnamPhone,
  normalizeCustomerSearch,
} from "@/src/utils/display";

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    cartId: "cart-1",
    menuItemId: "item-1",
    name: "Matcha Latte",
    category: "latte",
    imageUrl: null,
    size: "SMALL",
    unitPrice: 60_000,
    quantity: 1,
    sweetness: "FULL",
    iceOption: "NORMAL",
    coldwhisk: false,
    note: "",
    selectedOptionIds: [],
    quantityMap: {},
    addonsPrice: 10_000,
    addonPrices: {},
    quantityAddonOptions: [],
    clientPriceVnd: 60_000,
    originalClientPriceVnd: 60_000,
    addonVouchers: [],
    ...overrides,
  };
}

describe("formatKa — hiển thị tiền theo nghìn ká", () => {
  it("làm tròn lên cho khoản phải thu", () => {
    expect(formatKa(50_001, "ceil")).toBe("51 ká");
  });

  it("làm tròn xuống cho khoản giảm giá", () => {
    expect(formatKa(50_999, "floor")).toBe("50 ká");
  });

  it("giữ nguyên số nghìn khi tiền đã chia hết cho 1.000", () => {
    expect(formatKa(65_000)).toBe("65 ká");
  });
});

describe("formatOrderSize — không hiển thị enum thô", () => {
  it("map đủ ba size sang tên và dung tích", () => {
    expect(formatOrderSize("SMALL")).toBe("Cá con (360ml)");
    expect(formatOrderSize("MEDIUM")).toBe("Cá vừa (500ml)");
    expect(formatOrderSize("LARGE")).toBe("Cá lớn (700ml)");
  });
});

describe("getMenuItemCartQuantity — badge trên menu", () => {
  it("cộng quantity của mọi cấu hình có cùng menu item id", () => {
    const items = [
      makeCartItem({ cartId: "a", quantity: 2 }),
      makeCartItem({ cartId: "b", quantity: 3, size: "LARGE" }),
      makeCartItem({ cartId: "c", menuItemId: "item-2", quantity: 4 }),
    ];

    expect(getMenuItemCartQuantity(items, "item-1")).toBe(5);
  });
});

describe("deriveCheckoutRewards — điểm mua hàng và surplus", () => {
  it("không tính phí ship vào điểm mua hàng", () => {
    const result = deriveCheckoutRewards([], 99_999, {});
    expect(result.orderPoints).toBe(9);
  });

  it("cộng surplus VND toàn đơn rồi mới floor một lần", () => {
    const items = [
      makeCartItem({
        cartId: "a",
        unitPrice: 50_000,
        originalClientPriceVnd: 50_000,
        addonsPrice: 10_000,
        productVoucherId: "voucher-a",
        productVoucherDiscountVnd: 47_000,
      }),
      makeCartItem({
        cartId: "b",
        unitPrice: 60_000,
        originalClientPriceVnd: 60_000,
        addonsPrice: 10_000,
        productVoucherId: "voucher-b",
        productVoucherDiscountVnd: 56_000,
      }),
    ];

    const result = deriveCheckoutRewards(items, 85_000, {
      "voucher-a": 47_000,
      "voucher-b": 56_000,
    });
    expect(result.surplusVnd).toBe(13_000);
    expect(result.surplusPoints).toBe(1);
    expect(result.totalPoints).toBe(9);
  });
});

describe("formatVietnamPhone — staff search", () => {
  it("hiển thị số +84 theo dạng nội địa dễ đọc", () => {
    expect(formatVietnamPhone("+84912345678")).toBe("0912 345 678");
  });

  it("chuẩn hoá đủ các dạng nhập phổ biến để tìm suffix", () => {
    expect(normalizeCustomerSearch("0912 345 678")).toBe("912345678");
    expect(normalizeCustomerSearch("+84912345678")).toBe("912345678");
    expect(normalizeCustomerSearch("84912345678")).toBe("912345678");
    expect(normalizeCustomerSearch("5678")).toBe("5678");
  });

  it("giữ nguyên truy vấn tên khách", () => {
    expect(normalizeCustomerSearch("Linh Cá")).toBe("Linh Cá");
  });
});

describe("groupPointsLogs — lịch sử điểm theo đơn", () => {
  it("gom điểm mua hàng và surplus của cùng một đơn thành một sự kiện", () => {
    const groups = groupPointsLogs([
      {
        id: "log-1",
        delta: 8,
        reason: "order_complete",
        order_id: "order-1",
        voucher_id: null,
        created_at: "2026-07-24T10:00:00.000Z",
      },
      {
        id: "log-2",
        delta: 1,
        reason: "voucher_surplus",
        order_id: "order-1",
        voucher_id: null,
        created_at: "2026-07-24T10:00:00.100Z",
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      kind: "order_reward",
      orderPoints: 8,
      surplusPoints: 1,
      totalDelta: 9,
    });
  });

  it("không gộp log đảo điểm vào lần cộng điểm ban đầu", () => {
    const groups = groupPointsLogs([
      {
        id: "log-1",
        delta: 8,
        reason: "order_complete",
        order_id: "order-1",
        voucher_id: null,
        created_at: "2026-07-24T10:00:00.000Z",
      },
      {
        id: "log-2",
        delta: -8,
        reason: "order_complete_reversed",
        order_id: "order-1",
        voucher_id: null,
        created_at: "2026-07-24T11:00:00.000Z",
      },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.kind)).toEqual(["order_reversal", "order_reward"]);
  });
});
