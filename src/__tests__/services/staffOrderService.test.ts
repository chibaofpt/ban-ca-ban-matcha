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
          size: "L" as const,
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
          size: "M" as const,
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
    expect(sent.items[0].size).toBe("M");
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
          size: "L" as const,
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
