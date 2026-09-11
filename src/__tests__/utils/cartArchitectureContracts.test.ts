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

  });

  it("keeps canonical voucher caches and protected overlay/polling contracts", () => {
    const drawer = readSource("../../components/menu/CartDrawer.tsx");
    const picker = readSource("../../components/menu/cart/CartDiscountPicker.tsx");
    const adminTab = readSource("../../components/admin/AdminTabBar.tsx");

    expect(drawer).toContain("useCustomerVouchers");
    expect(drawer).toContain("useVoucherPackages");

    expect(picker).toMatch(/<BundleVoucherSetupSheet[\s\S]{0,120}layer="critical"/);
    expect(adminTab).toContain("refetchInterval: 20_000");
  });

  it("does not detach a persisted staff BUNDLE while its QR owner is rehydrating", () => {
    const staffPage = readSource("../../views/staff/StaffOrdersPage.tsx");
    expect(staffPage).toMatch(/if \(staffCustomerQrToken && customerInfo\?\.type !== "existing"\) return;\s*reconcileBundleApplications/);
    expect(staffPage).toContain('["staff", "cart-customer", staffCustomerQrToken]');
    expect(staffPage).toContain('["staff", "cart-customer-vouchers", staffCustomerQrToken]');
  });
});
