import { describe, expect, it } from "vitest";
import {
  buildVoucherActionModel,
  filterActiveMainCartVouchers,
  getProductDiscountSelection,
  resolveWalletUseNowIntent,
  selectOrderVoucherToken,
  type ProductDiscountTarget,
} from "@/src/utils/customerVoucherSelection";

describe("Mô hình chọn voucher khách hàng", () => {
  it("giữ nội dung card mở được khi action chọn bị khóa", () => {
    const action = buildVoucherActionModel({
      context: "cart",
      selected: false,
      selectable: false,
      disabledReason: "Chưa đạt giá trị đơn tối thiểu",
      estimatedBenefitVnd: 0,
    });

    expect(action).toEqual({
      kind: "selection",
      selected: false,
      disabled: true,
      reason: "Chưa đạt giá trị đơn tối thiểu",
    });
  });

  it("wallet dùng action riêng và trạng thái bận", () => {
    expect(buildVoucherActionModel({ context: "wallet", busy: true })).toEqual({
      kind: "use-now",
      label: "Dùng ngay",
      disabled: true,
      busy: true,
    });
  });
});

describe("order voucher production wiring", () => {
  it("applies eligible freeship in one tap and replaces the previous freeship token", () => {
    expect(resolveWalletUseNowIntent({ voucherType: "FREESHIP", canApplyOrder: true })).toEqual({ kind: "apply-order" });
    expect(selectOrderVoucherToken(
      ["fixed-discount", "old-freeship"],
      { qr_token: "new-freeship", voucher_type: "FREESHIP", discount_type: null },
      [
        { qr_token: "fixed-discount", voucher_type: "DISCOUNT", discount_type: "FIXED" },
        { qr_token: "old-freeship", voucher_type: "FREESHIP", discount_type: null },
      ],
    )).toEqual(["fixed-discount", "new-freeship"]);
  });

  it("keeps ACTIVE unavailable vouchers visible and excludes history", () => {
    const vouchers = [
      { qr_token: "discount", voucher_type: "DISCOUNT", status: "ACTIVE" },
      { qr_token: "freeship", voucher_type: "FREESHIP", status: "ACTIVE" },
      { qr_token: "history", voucher_type: "DISCOUNT", status: "REDEEMED" },
    ];

    expect(filterActiveMainCartVouchers(vouchers, "DISCOUNT").map((voucher) => voucher.qr_token)).toEqual(["discount"]);
    expect(filterActiveMainCartVouchers(vouchers, "FREESHIP").map((voucher) => voucher.qr_token)).toEqual(["freeship"]);
  });
});

describe("wallet Dùng ngay production controller", () => {
  it("phân luồng direct product, target-required và bundle setup khác detail click", () => {
    expect(resolveWalletUseNowIntent({ voucherType: "PRODUCT" })).toEqual({ kind: "apply-product" });
    expect(resolveWalletUseNowIntent({
      voucherType: "PRODUCT_DISCOUNT",
      productDiscountTargets: [{ cartId: "menu", menuItemId: "latte", size: "MEDIUM", estimatedBenefitVnd: 10_000 }],
    })).toEqual({ kind: "apply-product", selection: { menuItemId: "latte", size: "MEDIUM" } });
    expect(resolveWalletUseNowIntent({
      voucherType: "PRODUCT_DISCOUNT",
      productDiscountTargets: [
        { cartId: "a", menuItemId: "latte", size: "MEDIUM", estimatedBenefitVnd: 10_000 },
        { cartId: "b", menuItemId: "fusion", size: "LARGE", estimatedBenefitVnd: 12_000 },
      ],
    })).toEqual({ kind: "open-detail" });
    expect(resolveWalletUseNowIntent({ voucherType: "BUNDLE" })).toEqual({ kind: "open-bundle" });
  });
});

describe("PRODUCT_DISCOUNT trong giỏ hàng", () => {
  const targets: ProductDiscountTarget[] = [
    { cartId: "a", menuItemId: "latte", size: "MEDIUM", estimatedBenefitVnd: 20_000 },
    { cartId: "b", menuItemId: "latte", size: "MEDIUM", estimatedBenefitVnd: 10_000 },
  ];

  it("phân biệt 0, 1 và nhiều target có lợi ích dương", () => {
    expect(getProductDiscountSelection([], null).kind).toBe("none");
    expect(getProductDiscountSelection([targets[0]!], null)).toMatchObject({ kind: "single", target: targets[0] });
    expect(getProductDiscountSelection(targets, null)).toMatchObject({ kind: "multiple", targets });
  });

  it("cho phép thay voucher sản phẩm hiện tại và báo token bị thay", () => {
    expect(getProductDiscountSelection([targets[0]!], "old-token")).toMatchObject({
      kind: "single",
      replacementVoucherToken: "old-token",
    });
  });

});
