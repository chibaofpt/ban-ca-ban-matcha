import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), toastError: vi.fn() }));
vi.mock("@/src/lib/api/client", () => ({ apiClient: boundaries, resetForceLogout: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: boundaries.toastError, success: vi.fn() } }));

import VoucherModal from "@/src/components/shared/VoucherModal";
import { VOUCHER_QUERY_KEYS } from "@/src/constants/voucherQueryKeys";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import { useAuthStore } from "@/src/lib/store/authStore";
import { useVoucherModalStore } from "@/src/lib/store/voucherModalStore";
import type { VoucherPackage } from "@/src/services/customerVoucherService";

const basePackage = {
  id: "live-package", name: "Gói đang xem", description: "Chi tiết live", voucher_type: "DISCOUNT",
  acquisition_mode: "FREE_CLAIM", points_cost: 0, discount_type: "FIXED", discount_value: 10_000,
  menu_item_id: null, size: null, matcha_powder_id: null, milk_type_id: null,
  included_addon_option_ids: [], addon_option_id: null, covered_price_vnd: null,
  covered_delivery_fee_vnd: null, min_order_vnd: null, is_active: true, expires_after_days: null,
  quantity: 10, remaining_quantity: 10, max_per_user: 1, user_redeemed_count: 0,
  created_at: "2026-09-01T00:00:00.000Z",
} as VoucherPackage;

describe("VoucherModal — package detail theo raw query", () => {
  let packages: VoucherPackage[];
  let client: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    packages = [basePackage];
    boundaries.get.mockImplementation((url: string) => {
      if (url === "/api/voucher-packages") return Promise.resolve({ data: { data: packages } });
      if (url === "/api/profile/points") return Promise.resolve({ data: { data: { points_balance: 100, logs: [], pagination: { page: 1, limit: 10, total: 0, total_pages: 0 } } } });
      if (url === "/api/profile/vouchers") return Promise.resolve({ data: { data: [] } });
      throw new Error(`Unexpected GET ${url}`);
    });
    boundaries.post.mockResolvedValue({ data: { data: { granted_count: 0, expired_count: 0 } } });
    useAuthStore.setState({ user: { phone: "+84900000000", name: "Khách" } });
    useAuthModalStore.setState({ open: false, mode: "login", pendingIntent: null });
    useVoucherModalStore.setState({ open: true });
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  });
  afterEach(cleanup);

  async function renderAndOpenDetail() {
    render(<StrictMode><QueryClientProvider client={client}><VoucherModal /></QueryClientProvider></StrictMode>);
    fireEvent.click(await screen.findByRole("button", { name: "Nhận ưu đãi" }));
    fireEvent.click(await screen.findByRole("button", { name: "Xem chi tiết Gói đang xem" }));
    await screen.findByText("Chi tiết live");
  }

  it("refetch thành maxed ẩn catalog nhưng giữ detail và khoá CTA", async () => {
    await renderAndOpenDetail();
    packages = [{ ...basePackage, user_redeemed_count: 1 }];
    await act(() => client.invalidateQueries({ queryKey: VOUCHER_QUERY_KEYS.VOUCHER_PACKAGES }));
    await waitFor(() => expect(screen.getByText("Bạn đã nhận đủ số lượt cho phép của gói này.")).toBeTruthy());
    expect(screen.getByText("Chi tiết live")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nhận miễn phí" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Xem chi tiết Gói đang xem" })).toBeNull();
  });

  it("refetch xoá selected package đóng detail, báo lỗi chính xác và không mutation", async () => {
    await renderAndOpenDetail();
    packages = [];
    await act(() => client.invalidateQueries({ queryKey: VOUCHER_QUERY_KEYS.VOUCHER_PACKAGES }));
    await waitFor(() => expect(boundaries.toastError).toHaveBeenCalledWith("Gói ưu đãi không còn khả dụng."));
    await waitFor(() => expect(screen.queryByText("Chi tiết live")).toBeNull());
    expect(boundaries.post.mock.calls.filter(([url]) => url === "/api/profile/vouchers/claim")).toHaveLength(0);
  });
});
