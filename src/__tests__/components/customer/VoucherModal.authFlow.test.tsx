import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const adapter = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/src/lib/api/client", () => ({ apiClient: adapter, resetForceLogout: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/menu", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import AuthModal from "@/src/components/common/AuthModal";
import VoucherModal from "@/src/components/shared/VoucherModal";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import { useAuthStore } from "@/src/lib/store/authStore";
import { useVoucherModalStore } from "@/src/lib/store/voucherModalStore";
import type { VoucherPackage } from "@/src/services/customerVoucherService";

function makePackage(mode: "FREE_CLAIM" | "POINTS_EXCHANGE"): VoucherPackage {
  return {
    id: `${mode.toLowerCase()}-package`, name: mode === "FREE_CLAIM" ? "Quà miễn phí" : "Gói 40 điểm",
    description: "Chi tiết package", voucher_type: "DISCOUNT", acquisition_mode: mode,
    points_cost: mode === "FREE_CLAIM" ? 0 : 40, discount_type: "FIXED", discount_value: 10_000,
    menu_item_id: null, size: null, matcha_powder_id: null, milk_type_id: null,
    included_addon_option_ids: [], addon_option_id: null, covered_price_vnd: null,
    covered_delivery_fee_vnd: null, min_order_vnd: null, is_active: true, expires_after_days: null,
    quantity: 10, remaining_quantity: 10, max_per_user: 3, user_redeemed_count: 0,
    created_at: "2026-09-01T00:00:00.000Z",
  };
}

function setupAdapter(pkg: VoucherPackage) {
  adapter.get.mockImplementation((url: string) => {
    if (url === "/api/voucher-packages") return Promise.resolve({ data: { data: [pkg] } });
    if (url === "/api/profile/points") return Promise.resolve({ data: { data: { points_balance: 100, logs: [], pagination: { page: 1, limit: 10, total: 0, total_pages: 0 } } } });
    if (url === "/api/profile/vouchers") return Promise.resolve({ data: { data: [] } });
    throw new Error(`Unexpected GET ${url}`);
  });
  adapter.post.mockImplementation((url: string) => {
    if (url === "/api/auth/login") return Promise.resolve({ data: { data: { phone_number: "+84900000000", name: "Khách", insta_name: null, role: "CUSTOMER" } } });
    if (url === "/api/profile/vouchers/sync") return Promise.resolve({ data: { data: { granted_count: 0, expired_count: 0 } } });
    if (url === "/api/profile/vouchers/claim") return Promise.resolve({ data: { data: { qr_token: `claimed-${adapter.post.mock.calls.length}`, voucher_type: "DISCOUNT", status: "ACTIVE", expires_at: null, already_granted: false } } });
    if (url === "/api/profile/vouchers/exchange") return Promise.resolve({ data: { data: { qr_token: "exchanged", voucher_type: "DISCOUNT", status: "ACTIVE", expires_at: null } } });
    throw new Error(`Unexpected POST ${url}`);
  });
}

function renderFlow() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<StrictMode><QueryClientProvider client={client}><VoucherModal /><AuthModal /></QueryClientProvider></StrictMode>);
}

async function openPackageDetail(pkg: VoucherPackage) {
  await screen.findByRole("button", { name: `Xem chi tiết ${pkg.name}` });
  fireEvent.click(screen.getByRole("button", { name: `Xem chi tiết ${pkg.name}` }));
  await screen.findByText("Chi tiết package");
}

async function submitLoginForm() {
  fireEvent.change(screen.getByLabelText("Số điện thoại hoặc Instagram"), { target: { value: "0900000000" } });
  fireEvent.change(screen.getByLabelText("Mật khẩu"), { target: { value: "matkhau123" } });
  fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
  await waitFor(() => expect(adapter.post).toHaveBeenCalledWith("/api/auth/login", { phone_number: "0900000000", password: "matkhau123" }));
}

describe("VoucherModal + AuthModal — intent nhận voucher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null });
    useAuthModalStore.setState({ open: false, mode: "login", pendingIntent: null });
    useVoucherModalStore.setState({ open: true });
  });
  afterEach(cleanup);

  it.each(["x", "backdrop", "escape"] as const)("guest huỷ bằng %s: xoá intent, giữ voucher và không acquire sau login", async (dismiss) => {
    const pkg = makePackage("FREE_CLAIM");
    setupAdapter(pkg);
    const { container } = renderFlow();
    await openPackageDetail(pkg);
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập để nhận ưu đãi" }));
    expect(useVoucherModalStore.getState().open).toBe(true);
    expect(useAuthModalStore.getState().pendingIntent).toEqual({ type: "voucher_acquire", packageId: pkg.id });
    const authDialog = await screen.findByRole("dialog", { name: "Đăng nhập" });
    expect(authDialog.contains(document.activeElement)).toBe(true);
    expect(screen.queryByRole("button", { name: `Xem chi tiết ${pkg.name}` })).toBeNull();
    if (dismiss === "x") {
      const closeButtons = screen.getAllByRole("button", { name: "Đóng" });
      fireEvent.click(closeButtons[closeButtons.length - 1]);
    } else if (dismiss === "backdrop") {
      const backdrops = container.ownerDocument.querySelectorAll(".bg-foreground\\/40");
      const backdrop = backdrops[backdrops.length - 1];
      if (!backdrop) throw new Error("Expected AuthModal overlay backdrop");
      fireEvent.pointerDown(backdrop, { button: 0, pointerType: "mouse", isPrimary: true });
      fireEvent.click(backdrop);
    } else {
      fireEvent.keyDown(authDialog, { key: "Escape" });
    }
    await waitFor(() => expect(useAuthModalStore.getState().pendingIntent).toBeNull());
    expect(screen.getByText("Chi tiết package")).toBeTruthy();
    act(() => useAuthStore.getState().login("+84900000000", "Khách"));
    await waitFor(() => expect(adapter.post.mock.calls.filter(([url]) => url === "/api/profile/vouchers/claim")).toHaveLength(0));
  });

  it("giữ intent qua login và claim đúng một lần mỗi object intent dưới StrictMode", async () => {
    const pkg = makePackage("FREE_CLAIM");
    setupAdapter(pkg);
    renderFlow();
    await openPackageDetail(pkg);
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập để nhận ưu đãi" }));
    await submitLoginForm();
    await waitFor(() => expect(adapter.post.mock.calls.filter(([url]) => url === "/api/profile/vouchers/claim")).toHaveLength(1));
    act(() => useAuthModalStore.getState().openLoginWithIntent({ type: "voucher_acquire", packageId: pkg.id }));
    await waitFor(() => expect(adapter.post.mock.calls.filter(([url]) => url === "/api/profile/vouchers/claim")).toHaveLength(2));
  });

  it("POINTS sau login mở confirm thật; cancel không POST và confirm chỉ POST một lần", async () => {
    const pkg = makePackage("POINTS_EXCHANGE");
    setupAdapter(pkg);
    renderFlow();
    await openPackageDetail(pkg);
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập để nhận ưu đãi" }));
    await submitLoginForm();
    await screen.findByText("Xác nhận đổi voucher");
    fireEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    expect(adapter.post.mock.calls.filter(([url]) => url === "/api/profile/vouchers/exchange")).toHaveLength(0);
    expect(screen.getByText("Chi tiết package")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Đổi 40 🐟" }));
    await screen.findByText("Xác nhận đổi voucher");
    const exchangeButtons = screen.getAllByRole("button", { name: "Đổi 40 🐟" });
    fireEvent.click(exchangeButtons[exchangeButtons.length - 1]);
    await waitFor(() => expect(adapter.post.mock.calls.filter(([url]) => url === "/api/profile/vouchers/exchange")).toHaveLength(1));
  });
});
