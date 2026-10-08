import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

describe("staff voucher flow contracts", () => {
  it("chỉ gửi voucher giảm đơn còn được projection áp dụng khi checkout POS", () => {
    const staffPage = readSource("../../views/staff/StaffOrdersPage.tsx");
    const checkout = staffPage.slice(staffPage.indexOf("const handleCheckoutConfirm"), staffPage.indexOf("// ── QR scan handlers"));
    expect(checkout).toMatch(/const discountVoucherIds = selectedDiscountIds\.filter\(\s*\(token\) => cartProjection\.appliedOrderVoucherTokens\.includes\(token\),?\s*\);/);
    expect(checkout).toContain("discount_voucher_ids: discountVoucherIds");
  });

  it("giữ quy tắc PERCENT và pending ADDON trên mọi adapter staff", () => {
    const addonPicker = readSource("../../components/shared/AddonItemPicker.tsx");
    const productModal = readSource("../../components/shared/ProductModal.tsx");
    const staffPage = readSource("../../views/staff/StaffOrdersPage.tsx");

    expect(staffPage).toContain("selectOrderVoucherToken(nextWalletTokens, scannedVoucher, projectionVouchers)");
    expect(addonPicker).toContain("groupOptionIds: group.options.map((candidate) => candidate.id)");
    expect(addonPicker).toContain("isExtraMatcha: group.is_dynamic_gram || option.gram_value !== null");
    expect(staffPage).toContain("pendingAddonVoucherIntent={pendingAddonVoucher}");
    expect(staffPage).toContain("...(pendingAddonVoucher ? [pendingAddonVoucher.voucherId] : [])");
    expect(productModal).toContain("onPendingAddonVoucherChange");
    expect(productModal).toContain("consumePendingAddon: replace");
  });
});
