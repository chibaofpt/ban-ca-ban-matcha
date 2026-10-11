import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/api/client", () => ({ apiClient: { post: vi.fn() } }));

import { apiClient } from "@/src/lib/api/client";
import { getStaffCustomerOrderIdentity, useStaffCartStore } from "@/src/lib/store/staffCartStore";
import { createStaffOrder } from "@/src/services/staffOrderService";

const customer = (token: string) => ({
  type: "existing" as const,
  data: { qr_token: token, phone_number: null, name: "Cá", points_balance: 0 },
});
const stored = new Map<string, string>();

describe("Bằng chứng QR khách tại quầy — APPLICATION_LOGIC / FRONTEND_CONTRACT", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stored.clear();
    vi.stubGlobal("localStorage", {
      length: 0,
      clear: () => stored.clear(),
      getItem: (key: string) => stored.get(key) ?? null,
      key: () => null,
      removeItem: (key: string) => { stored.delete(key); },
      setItem: (key: string, value: string) => { stored.set(key, value); },
    } satisfies Storage);
    useStaffCartStore.getState().detachCustomer();
  });

  it("chọn khách từ tìm kiếm không tạo bằng chứng quét QR", async () => {
    useStaffCartStore.getState().setCustomerInfo(customer("customer-a"));
    expect(useStaffCartStore.getState().scannedCustomerQrToken).toBeNull();
    expect(getStaffCustomerOrderIdentity()).toEqual({ customer_identifier: "customer-a" });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: { id: "order-a" } } });
    await createStaffOrder({ ...getStaffCustomerOrderIdentity(), items: [] });
    expect(apiClient.post).toHaveBeenCalledWith("/api/staff/orders", {
      customer_identifier: "customer-a", items: [],
    });
  });

  it("scan đúng khách gửi proof, chọn lại hoặc đổi khách xoá proof", async () => {
    useStaffCartStore.getState().setCustomerInfo(customer("customer-a"));
    expect(useStaffCartStore.getState().setScannedCustomerQrToken("customer-a").ok).toBe(true);
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: { id: "order-a" } } });
    await createStaffOrder({ ...getStaffCustomerOrderIdentity(), items: [] });
    expect(apiClient.post).toHaveBeenCalledWith("/api/staff/orders", {
      customer_identifier: "customer-a", customer_qr_token: "customer-a", items: [],
    });
    useStaffCartStore.getState().setCustomerInfo(customer("customer-a"));
    expect(getStaffCustomerOrderIdentity()).toEqual({ customer_identifier: "customer-a" });
    useStaffCartStore.getState().setScannedCustomerQrToken("customer-a");
    useStaffCartStore.getState().setCustomerInfo(customer("customer-b"));
    expect(useStaffCartStore.getState().scannedCustomerQrToken).toBeNull();
    expect(getStaffCustomerOrderIdentity()).toEqual({ customer_identifier: "customer-b" });
  });

  it("không nhận QR của khách khác làm proof cho người đang chọn", () => {
    useStaffCartStore.getState().setCustomerInfo(customer("customer-a"));
    expect(useStaffCartStore.getState().setScannedCustomerQrToken("customer-b")).toMatchObject({
      ok: false, code: "VOUCHER_CONFLICT",
    });
    expect(getStaffCustomerOrderIdentity()).toEqual({ customer_identifier: "customer-a" });
  });

  it("reload chỉ giữ định danh và không phục hồi proof kể cả blob cũ có proof", async () => {
    useStaffCartStore.getState().setCustomerInfo(customer("customer-a"));
    useStaffCartStore.getState().setScannedCustomerQrToken("customer-a");
    const serialized = stored.get("bcbm-staff-cart");
    expect(serialized).toBeDefined();
    expect(serialized).not.toContain("scannedCustomerQrToken");
    stored.set("bcbm-staff-cart", JSON.stringify({
      version: 6,
      state: {
        items: [], selectedOrderVoucherTokens: [], bundleApplications: [],
        customerQrToken: "customer-a", scannedCustomerQrToken: "customer-a",
      },
    }));
    await useStaffCartStore.persist.rehydrate();
    expect(useStaffCartStore.getState().customerQrToken).toBe("customer-a");
    expect(useStaffCartStore.getState().scannedCustomerQrToken).toBeNull();
  });
});
