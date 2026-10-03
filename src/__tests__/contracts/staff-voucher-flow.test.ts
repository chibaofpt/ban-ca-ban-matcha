import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

describe("staff voucher flow contracts", () => {
  it("giữ quy tắc PERCENT và pending ADDON trên mọi adapter staff", () => {
    const cartDiscount = readSource("../../components/menu/cart/CartDiscountPicker.tsx");
    const addonPicker = readSource("../../components/shared/AddonItemPicker.tsx");
    const productModal = readSource("../../components/shared/ProductModal.tsx");
    const staffPage = readSource("../../views/staff/StaffOrdersPage.tsx");

    expect(cartDiscount).toContain("selectOrderVoucherToken(previous, acquiredSelection");
    expect(cartDiscount).toContain("selectOrderVoucherToken(previous, refreshedVoucher");
    expect(staffPage).toContain("selectOrderVoucherToken(nextWalletTokens, scannedVoucher, projectionVouchers)");
    expect(addonPicker).toContain("groupOptionIds: group.options.map((candidate) => candidate.id)");
    expect(addonPicker).toContain("isExtraMatcha: group.is_dynamic_gram || option.gram_value !== null");
    expect(staffPage).toContain("pendingAddonVoucherIntent={pendingAddonVoucher}");
    expect(staffPage).toContain("...(pendingAddonVoucher ? [pendingAddonVoucher.voucherId] : [])");
    expect(productModal).toContain("onPendingAddonVoucherChange");
    expect(productModal).toContain("consumePendingAddon: replace");
  });
});
