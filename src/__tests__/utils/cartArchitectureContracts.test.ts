import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

describe("minimal shared cart architecture contracts", () => {
  it("persists only the approved customer and staff source fields", () => {
    const customer = readSource("../../lib/store/cartStore.ts");
    const staff = readSource("../../lib/store/staffCartStore.ts");
    const customerPartial = customer.match(/partialize:\s*\(state\)\s*=>\s*\(\{([^}]*)\}\)/)?.[1] ?? "";
    const staffPartial = staff.match(/partialize:\s*\(state\)\s*=>\s*\(\{([^}]*)\}\)/)?.[1] ?? "";

    expect(customerPartial).toContain("items: state.items");
    expect(customerPartial).toContain("selectedOrderVoucherTokens");
    expect(customerPartial).toContain("voucherOwnerKey");
    expect(customerPartial).toContain("bundleApplications");
    expect(customerPartial).not.toMatch(/isCartOpen|pendingAddon|bundleRuntime|projectedTotal|persistenceWarning/);

    expect(staffPartial).toContain("items: state.items");
    expect(staffPartial).toContain("selectedOrderVoucherTokens");
    expect(staffPartial).toContain("customerQrToken");
    expect(staffPartial).toContain("bundleApplications");
    expect(staffPartial).not.toMatch(/customerInfo|points|discountVoucher|pendingAddon|bundleRuntime|projectedTotal|persistenceWarning/);
  });

  it("detaches voucher ownership on active and forced logout paths", () => {
    const navbar = readSource("../../components/common/Navbar.tsx");
    const authGuard = readSource("../../components/common/AuthGuardProvider.tsx");
    const adminTab = readSource("../../components/admin/AdminTabBar.tsx");

    expect(navbar).toMatch(/detachVoucherOwner\(null\);\s*logout\(\)/);
    expect(authGuard).toContain("useCartStore.getState().detachVoucherOwner(null)");
    expect(authGuard).toContain("useStaffCartStore.getState().detachCustomer()");
    expect(adminTab).toContain("detachCustomer()");
  });

  it("keeps canonical voucher caches and protected overlay/polling contracts", () => {
    const drawer = readSource("../../components/menu/CartDrawer.tsx");
    const picker = readSource("../../components/menu/cart/CartDiscountPicker.tsx");
    const adminTab = readSource("../../components/admin/AdminTabBar.tsx");
    const confirmModal = readSource("../../components/ui/ConfirmModal.tsx");
    const wizard = readSource("../../components/admin/VoucherWizard.tsx");
    const orderTabs = readSource("../../components/staff/OrderTabs.tsx");
    const historyItems = readSource("../../components/customer/OrderHistoryItems.tsx");
    const bundleSection = readSource("../../components/menu/cart/CartBundleSection.tsx");

    expect(drawer).toContain("useCustomerVouchers");
    expect(drawer).toContain("useVoucherPackages");
    expect(drawer).toContain("VOUCHER_QUERY_KEYS.CUSTOMER_VOUCHERS");
    expect(drawer).toContain("eligible_sizes");
    const closeHandler = drawer.match(/const handleClose = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[/)?.[1] ?? "";
    expect(closeHandler).not.toContain("setSelectedVoucherIds");
    expect(drawer).not.toMatch(/if \(!isCartOpen[\s\S]{0,120}setSelectedVoucherIds/);
    expect(drawer).toContain("persistenceWarning");
    expect(readSource("../../components/staff/StaffCartDrawer.tsx")).toContain("persistenceWarning");

    expect(picker).toMatch(/<BundleVoucherSetupSheet[\s\S]{0,120}layer="critical"/);
    expect(adminTab).toContain("refetchInterval: 20_000");
    expect(drawer).toContain("z-70");
    expect(drawer).toContain("z-[71]");
    expect(confirmModal).toContain("z-[250]");
    expect(confirmModal).toContain("z-[251]");
    expect(confirmModal).toContain("onAfterClose?: () => void;");
    expect(confirmModal).toContain("onCloseAutoFocus");
    expect(confirmModal).not.toMatch(/useEffect\(\(\) => \{[\s\S]*closeReported/);
    expect(wizard).toContain("onAfterClose={handleConfirmAfterClose}");
    expect(wizard).not.toContain("setTimeout(");
    const handleSubmitSuccessIndex = wizard.indexOf("const handleSubmitSuccess");
    const handleConfirmAfterCloseIndex = wizard.indexOf("const handleConfirmAfterClose");
    expect(handleSubmitSuccessIndex).toBeGreaterThan(-1);
    expect(handleConfirmAfterCloseIndex).toBeGreaterThan(handleSubmitSuccessIndex);
    const wizardSuccessBody = wizard.slice(handleSubmitSuccessIndex, handleConfirmAfterCloseIndex);
    expect(wizardSuccessBody).toContain("setConfirmState(\"success\")");
    const wizardAfterConfirmBody = wizard.slice(handleConfirmAfterCloseIndex, wizard.indexOf("const next", handleConfirmAfterCloseIndex));
    expect(wizardAfterConfirmBody).toContain("setStep(1)");
    expect(wizardAfterConfirmBody).toContain("close(false)");
    expect(readSource("../../components/admin/AdminVoucherPackageDetail.tsx")).toContain("onAfterClose={handleConfirmationAfterClose}");
    expect(readSource("../../components/admin/AdminVoucherPackageDetail.tsx")).not.toContain("discardOpen");
    expect(readSource("../../components/admin/AdminVoucherPackageDetail.tsx")).not.toContain("toggleOpen");
    const overlay = readSource("../../components/ui/ResponsiveOverlay.tsx");
    const adaptive = readSource("../../components/shared/AdaptiveSelect.tsx");
    expect(overlay).toContain("onCloseAutoFocus");
    expect(overlay).not.toContain("!nextOpen && !open");
    expect(overlay).toContain("const openRef = useRef(open);");
    expect(overlay).toContain("openRef.current = open;");
    expect(overlay).toContain("if (!openRef.current) completeClose();");
    expect(adaptive).toContain("const openRef = useRef(open);");
    expect(adaptive).toContain("openRef.current = open;");
    expect(adaptive).toMatch(/queueMicrotask\(\(\) => \{\s*if \(!openRef\.current\) registration\.release\(\);\s*\}\);/);
    const stack = readSource("../../components/ui/OverlayStackProvider.tsx");
    expect(stack).toContain("useLayoutEffect");
    expect(stack).toContain("LAYER_Z_BANDS");
    expect(stack).toContain("base: 40");
    expect(stack).toContain("nested: 90");
    expect(stack).toContain("critical: 190");
    expect(stack).not.toContain("1000 + index * 2");
    expect(orderTabs).toContain('...(!isAdmin ? [{ id: "pending"');
    expect(historyItems).toMatch(/voucher_type === "PRODUCT_DISCOUNT"[\s\S]{0,120}return false/);
    expect(bundleSection).toContain("Chọn lại món");
    expect(bundleSection).not.toContain("onSwapItem");
  });

  it("does not detach a persisted staff BUNDLE while its QR owner is rehydrating", () => {
    const staffPage = readSource("../../views/staff/StaffOrdersPage.tsx");
    expect(staffPage).toMatch(/if \(staffCustomerQrToken && customerInfo\?\.type !== "existing"\) return;\s*reconcileBundleApplications/);
    expect(staffPage).toContain('["staff", "cart-customer", staffCustomerQrToken]');
    expect(staffPage).toContain('["staff", "cart-customer-vouchers", staffCustomerQrToken]');
  });
});
