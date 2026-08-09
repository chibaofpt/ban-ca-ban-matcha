import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/src/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

import { apiClient } from "@/src/lib/api/client";
import {
  searchCustomers,
  createStaffOrder,
  getStaffOrder,
  updateStaffOrderStatus,
  scanQrToken,
} from "@/src/services/staffOrderService";

describe("searchCustomers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("trả về danh sách khách hàng", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        data: {
          items: [
            { id: "1", name: "Nguyễn Văn A", phone_number: "+84912345678", points_balance: 100 }
          ]
        },
      },
    });

    const result = await searchCustomers("1234");

    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Nguyễn Văn A");
  });

  it("gọi đúng endpoint với tham số q", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: { items: [] } },
    });

    await searchCustomers("Linh");

    expect(apiClient.get).toHaveBeenCalledWith(
      "/api/staff/users",
      expect.objectContaining({ params: { q: "Linh" } })
    );
  });
});

describe("createStaffOrder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gọi POST /api/staff/orders với payload đúng", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: {} } });

    const payload = {
      phone_number: "+84912345678",
      items: [
        {
          menu_item_id: "item-1",
          quantity: 2,
          size: "MEDIUM" as const,
          sweetness: "QUARTER" as const,
          ice_option: "NORMAL" as const,
          coldwhisk: false,
          addon_option_ids: [],
          client_price_vnd: 69000,
        },
      ],
    };

    await createStaffOrder(payload);

    expect(apiClient.post).toHaveBeenCalledWith("/api/staff/orders", payload);
  });

  it("payload item phải có size, ice_option, coldwhisk, client_price_vnd", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: {} } });

    const payload = {
      phone_number: "+84912345678",
      items: [
        {
          menu_item_id: "item-daily",
          quantity: 1,
          size: "SMALL" as const,
          sweetness: "NONE" as const,
          ice_option: "LESS_ICE" as const,
          coldwhisk: true,
          addon_option_ids: [],
          client_price_vnd: 45000,
        },
      ],
    };

    await createStaffOrder(payload);

    const sent = vi.mocked(apiClient.post).mock.calls[0][1] as typeof payload;
    expect(sent.items[0].size).toBe("SMALL");
    expect(sent.items[0].ice_option).toBe("LESS_ICE");
    expect(sent.items[0].coldwhisk).toBe(true);
    expect(sent.items[0].client_price_vnd).toBe(45000);
  });

  it("selected_powder_id và selected_milk_type_id được forward khi cung cấp", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: {} } });

    const payload = {
      phone_number: "+84912345678",
      items: [
        {
          menu_item_id: "item-fusion",
          quantity: 1,
          size: "MEDIUM" as const,
          sweetness: "QUARTER" as const,
          ice_option: "NORMAL" as const,
          coldwhisk: false,
          addon_option_ids: [],
          client_price_vnd: 75000,
          selected_powder_id: "powder-abc",
          selected_milk_type_id: "milk-xyz",
        },
      ],
    };

    await createStaffOrder(payload);

    const sent = vi.mocked(apiClient.post).mock.calls[0][1] as typeof payload;
    expect(sent.items[0].selected_powder_id).toBe("powder-abc");
    expect(sent.items[0].selected_milk_type_id).toBe("milk-xyz");
  });

  it("forward BANK_TRANSFER và trả data đơn thay vì bỏ response", async () => {
    const order = {
      id: "order-payment-1",
      status: "PENDING" as const,
      order_type: "COUNTER" as const,
      payment_method: "BANK_TRANSFER" as const,
      order_code: "BCBM-PAY001",
      auto_cancel_at: "2026-08-09T10:20:00.000Z",
      payment_qr_url: "https://img.vietqr.io/payment.jpg",
      subtotal_vnd: 69_000,
      total_voucher_discount_vnd: 0,
      total_vnd: 69_000,
      shipping_fee_vnd: 0,
      freeship_discount_vnd: 0,
      grand_total_vnd: 69_000,
      points_earned: null,
      skipped_vouchers: [],
    };
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: order } });
    const payload = {
      payment_method: "BANK_TRANSFER" as const,
      items: [
        {
          menu_item_id: "item-1",
          quantity: 1,
          size: "MEDIUM" as const,
          sweetness: "FULL" as const,
          ice_option: "NORMAL" as const,
          coldwhisk: false,
          addon_option_ids: [],
          client_price_vnd: 69_000,
        },
      ],
    };

    const result = await createStaffOrder(payload);

    expect(apiClient.post).toHaveBeenCalledWith("/api/staff/orders", payload);
    expect(result).toEqual(order);
  });
});

describe("quản lý giao dịch chuyển khoản tại quầy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lấy lại chi tiết đơn đang chờ theo endpoint service", async () => {
    const order = { id: "order-payment-1", status: "PENDING" };
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: order } });

    const result = await getStaffOrder("order-payment-1");

    expect(apiClient.get).toHaveBeenCalledWith("/api/staff/orders/order-payment-1");
    expect(result).toEqual(order);
  });

  it("xác nhận thanh toán bằng transition COMPLETED hiện có", async () => {
    const order = { id: "order-payment-1", status: "COMPLETED" };
    vi.mocked(apiClient.patch).mockResolvedValueOnce({ data: { data: order } });

    const result = await updateStaffOrderStatus("order-payment-1", "COMPLETED");

    expect(apiClient.patch).toHaveBeenCalledWith("/api/staff/orders/order-payment-1", {
      status: "COMPLETED",
    });
    expect(result).toEqual(order);
  });

  it("huỷ giao dịch bằng transition CANCELLED hiện có", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce({
      data: { data: { id: "order-payment-1", status: "CANCELLED" } },
    });

    await updateStaffOrderStatus("order-payment-1", "CANCELLED");

    expect(apiClient.patch).toHaveBeenCalledWith("/api/staff/orders/order-payment-1", {
      status: "CANCELLED",
    });
  });
});

describe("scanQrToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("trả type user khi QR là user", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        data: {
          type: "user",
          data: {
            id: "qr-token-abc",
            name: "Linh Cá Heo",
            phone_number: "+84987654321",
            points_balance: 120,
          },
        },
      },
    });

    const result = await scanQrToken("qr-token-abc");

    expect(result.type).toBe("user");
    if (result.type === "user") {
      expect(result.data.name).toBe("Linh Cá Heo");
    }
  });

  it("trả type voucher khi QR là voucher DISCOUNT", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        data: {
          type: "voucher",
          data: {
            id: "qr-voucher-xyz",
            voucher_type: "DISCOUNT",
            discount_type: "PERCENT",
            discount_value: 20,
            menu_item_id: null,
            status: "ACTIVE",
            expires_at: null,
          },
        },
      },
    });

    const result = await scanQrToken("qr-voucher-xyz");

    expect(result.type).toBe("voucher");
    if (result.type === "voucher") {
      expect(result.data.voucher_type).toBe("DISCOUNT");
      expect(result.data.status).toBe("ACTIVE");
    }
  });

  it("gọi đúng endpoint với token", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: { type: "user", data: {} } },
    });

    await scanQrToken("my-token");

    expect(apiClient.get).toHaveBeenCalledWith(
      "/api/staff/scan",
      expect.objectContaining({ params: { token: "my-token" } })
    );
  });
});
