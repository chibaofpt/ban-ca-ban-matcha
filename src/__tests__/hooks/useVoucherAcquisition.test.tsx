import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useVoucherAcquisition } from "@/src/hooks/useVoucherAcquisition";
import {
  claimFreeVoucher,
  exchangeVoucher,
  type VoucherPackage,
} from "@/src/services/customerVoucherService";
import { VOUCHER_QUERY_KEYS } from "@/src/constants/voucherQueryKeys";

vi.mock("@/src/services/customerVoucherService", () => ({
  claimFreeVoucher: vi.fn(),
  exchangeVoucher: vi.fn(),
}));

describe("useVoucherAcquisition", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("should handle FREE_CLAIM successfully and invalidate queries", async () => {
    vi.mocked(claimFreeVoucher).mockResolvedValue({
      qr_token: "test-token",
      voucher_type: "BUNDLE",
      status: "ACTIVE",
      expires_at: null,
      already_granted: false,
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useVoucherAcquisition(), { wrapper });
    
    let res;
    await act(async () => {
      res = await result.current.acquire({
        id: "pkg-1",
        acquisition_mode: "FREE_CLAIM",
      } as VoucherPackage);
    });

    expect(claimFreeVoucher).toHaveBeenCalledWith("pkg-1");
    expect(res).toEqual({
      qr_token: "test-token",
      voucher_type: "BUNDLE",
      status: "ACTIVE",
      expires_at: null,
      already_granted: false,
    });
    expect(result.current.status).toBe("SUCCESS");
    
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: VOUCHER_QUERY_KEYS.CUSTOMER_VOUCHERS });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: VOUCHER_QUERY_KEYS.VOUCHER_PACKAGES });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: VOUCHER_QUERY_KEYS.CUSTOMER_POINTS });
  });

  it("should handle POINTS_EXCHANGE successfully", async () => {
    vi.mocked(exchangeVoucher).mockResolvedValue({
      qr_token: "test-token-2",
      voucher_type: "DISCOUNT",
      status: "ACTIVE",
      expires_at: null,
    });

    const { result } = renderHook(() => useVoucherAcquisition(), { wrapper });
    
    await act(async () => {
      await result.current.acquire({
        id: "pkg-2",
        acquisition_mode: "POINTS_EXCHANGE",
      } as VoucherPackage);
    });

    expect(exchangeVoucher).toHaveBeenCalledWith("pkg-2");
    expect(result.current.status).toBe("SUCCESS");
  });

  it("should handle errors and update status", async () => {
    const error = new Error("Test error");
    vi.mocked(claimFreeVoucher).mockRejectedValue(error);

    const { result } = renderHook(() => useVoucherAcquisition(), { wrapper });
    
    await act(async () => {
      try {
        await result.current.acquire({
          id: "pkg-3",
          acquisition_mode: "FREE_CLAIM",
        } as VoucherPackage);
      } catch {
        // Ignored
      }
    });

    expect(result.current.status).toBe("ERROR");
    expect(result.current.error).toBe(error);
  });
});
