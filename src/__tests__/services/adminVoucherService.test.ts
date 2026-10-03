import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock("@/src/lib/api/client", () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

import {
  createVoucherPackage,
  getVoucherPackageRecipientHistory,
  grantVoucherToCustomer,
  searchVoucherPackageOwners,
  type CreateVoucherPackageInput,
} from "@/src/services/adminVoucherService";

describe("Dịch vụ quản trị chủ sở hữu voucher", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gọi đúng URL với tìm kiếm, trạng thái và cursor", async () => {
    mockGet.mockResolvedValue({ data: { data: { users: [], next_cursor: null } } });
    await searchVoucherPackageOwners("pkg-1", { q: "@matcha", status: "ACTIVE", cursor: "user-token" });
    expect(mockGet).toHaveBeenCalledWith("/api/admin/voucher-packages/pkg-1/owners", { params: { q: "@matcha", status: "ACTIVE", cursor: "user-token" } });
  });

  it("gọi đúng URL lịch sử recipient và truyền status/cursor", async () => {
    const history = { vouchers: [], meta: { has_more: false, next_cursor: null } };
    mockGet.mockResolvedValue({ data: { data: history } });

    await expect(getVoucherPackageRecipientHistory("pkg-1", "customer-token", {
      status: "CURRENT",
      cursor: "next-token",
    })).resolves.toEqual(history);
    expect(mockGet).toHaveBeenCalledWith(
      "/api/admin/voucher-packages/pkg-1/recipients/customer-token",
      { params: { status: "CURRENT", cursor: "next-token" } },
    );
  });

  it("gửi đúng payload cho một admin gift và giữ lỗi có cấu trúc", async () => {
    const voucher = {
      qr_token: "voucher-token",
      voucher_type: "DISCOUNT",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      expires_at: null,
      already_granted: false,
    } as const;
    mockPost.mockResolvedValueOnce({ data: { data: voucher } });

    await expect(grantVoucherToCustomer("pkg-1", {
      user_qr_token: "customer-token",
      request_id: "55555555-5555-4555-8555-555555555555",
      acknowledge_additional_gift: true,
    })).resolves.toEqual(voucher);
    expect(mockPost).toHaveBeenCalledWith(
      "/api/admin/voucher-packages/pkg-1/grants",
      {
        user_qr_token: "customer-token",
        request_id: "55555555-5555-4555-8555-555555555555",
        acknowledge_additional_gift: true,
      },
    );

    const error = Object.assign(new Error("Need confirmation"), {
      response: {
        status: 422,
        data: {
          error: "Need confirmation",
          code: "BUSINESS_RULE_VIOLATION",
          details: { reason: "ADDITIONAL_GIFT_CONFIRMATION_REQUIRED" },
        },
      },
      isAxiosError: true,
    });
    mockPost.mockRejectedValueOnce(error);
    await expect(grantVoucherToCustomer("pkg-1", {
      user_qr_token: "customer-token",
      request_id: "66666666-6666-4666-8666-666666666666",
    })).rejects.toMatchObject({
      status: 422,
      code: "BUSINESS_RULE_VIOLATION",
      details: { reason: "ADDITIONAL_GIFT_CONFIRMATION_REQUIRED" },
    });
  });

  it("unwrap response thành công và giữ nguyên payload BUNDLE", async () => {
    const payload: CreateVoucherPackageInput = {
      voucher_type: "BUNDLE",
      name: "Mua 1 tặng 1",
      acquisition_mode: "AUTO_GRANT",
      points_cost: 0,
      bundle_rule: {
        buy_quantity: 1,
        reward_quantity: 1,
        reward_kind: "PRODUCT",
        reward_mode: "SAME_CONFIG",
        benefit_scaling: "PER_BUNDLE",
        max_applications_per_order: 1,
        qualifier_products: [],
        reward_products: [],
        reward_addon_option_ids: [],
      },
    };
    const packageResponse = { id: "pkg-1", name: payload.name };
    mockPost.mockResolvedValue({ data: { data: packageResponse } });

    await expect(createVoucherPackage(payload)).resolves.toEqual(packageResponse);
    expect(mockPost).toHaveBeenCalledWith("/api/admin/voucher-packages", payload);
  });

  it("giữ nguyên lỗi có status, code và details từ API", async () => {
    const error = Object.assign(new Error("Request failed"), {
      response: {
        status: 422,
        data: { error: "Không thể kích hoạt", code: "BUSINESS_RULE_VIOLATION", details: { reason: "TARGET_UNAVAILABLE" } },
      },
      isAxiosError: true,
    });
    mockPost.mockRejectedValue(error);
    await expect(createVoucherPackage({
      voucher_type: "BUNDLE",
      name: "Mua 1 tặng 1",
      acquisition_mode: "AUTO_GRANT",
      points_cost: 0,
      bundle_rule: {
        buy_quantity: 1,
        reward_quantity: 1,
        reward_kind: "PRODUCT",
        reward_mode: "SAME_CONFIG",
        benefit_scaling: "PER_BUNDLE",
        max_applications_per_order: 1,
        qualifier_products: [],
        reward_products: [],
        reward_addon_option_ids: [],
      },
    })).rejects.toMatchObject({ message: "Không thể kích hoạt", status: 422, code: "BUSINESS_RULE_VIOLATION", details: { reason: "TARGET_UNAVAILABLE" } });
  });
});
