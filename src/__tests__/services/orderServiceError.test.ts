import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/api/client", () => ({
  apiClient: { post: vi.fn() },
}));

import { apiClient } from "@/src/lib/api/client";
import {
  BundleNotEligibleError,
  createOrder,
  PriceChangedError,
} from "@/src/services/orderService";

describe("createOrder — bảo toàn lỗi API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("422 VOUCHER_EXPIRED → giữ nguyên message, status, code và details từ server", async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce({
      response: {
        status: 422,
        data: {
          error: "Voucher đã hết hạn",
          code: "VOUCHER_EXPIRED",
          details: { voucher_qr_token: "voucher-public-token" },
        },
      },
    });

    let caught: unknown;
    try {
      await createOrder([]);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).toMatchObject({
      message: "Voucher đã hết hạn",
      status: 422,
      code: "VOUCHER_EXPIRED",
      details: { voucher_qr_token: "voucher-public-token" },
    });
  });

  it("422 VOUCHER_REDEEMED → giữ nguyên lỗi nghiệp vụ từ server", async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce({
      response: {
        status: 422,
        data: {
          error: "Voucher đã được sử dụng",
          code: "VOUCHER_REDEEMED",
          details: { voucher_qr_token: "redeemed-public-token" },
        },
      },
    });

    await expect(createOrder([])).rejects.toMatchObject({
      message: "Voucher đã được sử dụng",
      status: 422,
      code: "VOUCHER_REDEEMED",
      details: { voucher_qr_token: "redeemed-public-token" },
    });
  });

  it("503 STORE_CLOSED → giữ nguyên lỗi đóng cửa từ server", async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce({
      response: {
        status: 503,
        data: {
          error: "Cửa hàng hiện đã đóng cửa",
          code: "STORE_CLOSED",
          details: { reopen_at: "2026-09-05T01:00:00.000Z" },
        },
      },
    });

    await expect(createOrder([])).rejects.toMatchObject({
      message: "Cửa hàng hiện đã đóng cửa",
      status: 503,
      code: "STORE_CLOSED",
      details: { reopen_at: "2026-09-05T01:00:00.000Z" },
    });
  });

  it("409 PRICE_CHANGED → giữ specialized error và metadata từ server", async () => {
    const details = {
      conflicts: [{
        menu_item_id: "item-meyumi",
        name: "Meyumi",
        size: "SMALL",
        client_price_vnd: 55_000,
        server_price_vnd: 60_000,
      }],
    };
    vi.mocked(apiClient.post).mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          error: "Giá món đã thay đổi",
          code: "PRICE_CHANGED",
          details,
        },
      },
    });

    let caught: unknown;
    try {
      await createOrder([]);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PriceChangedError);
    expect(caught).toMatchObject({
      message: "Giá món đã thay đổi",
      status: 409,
      code: "PRICE_CHANGED",
      details,
      conflicts: details.conflicts,
    });
  });

  it("422 BUSINESS_RULE_VIOLATION BUNDLE → giữ specialized error và code server", async () => {
    const details = { reason: "NO_ACTIVE_REWARD" };
    vi.mocked(apiClient.post).mockRejectedValueOnce({
      response: {
        status: 422,
        data: {
          error: "Phần quà bundle hiện không còn phục vụ",
          code: "BUSINESS_RULE_VIOLATION",
          details,
        },
      },
    });

    let caught: unknown;
    try {
      await createOrder([]);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BundleNotEligibleError);
    expect(caught).toMatchObject({
      message: "Phần quà bundle hiện không còn phục vụ",
      status: 422,
      code: "BUSINESS_RULE_VIOLATION",
      details,
      reason: "NO_ACTIVE_REWARD",
    });
  });

  it("lỗi mạng không có response → là Error kết nối và không bịa code server", async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error("Network Error"));

    let caught: unknown;
    try {
      await createOrder([]);
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      message: "Không thể kết nối đến máy chủ. Vui lòng thử lại.",
    });
    expect(caught).not.toHaveProperty("code");
  });
});
