import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
vi.mock("@/src/lib/api/client", () => ({ apiClient: { get: (...args: unknown[]) => mockGet(...args) } }));

import { searchVoucherPackageOwners } from "@/src/services/adminVoucherService";

describe("Dịch vụ quản trị chủ sở hữu voucher", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gọi đúng URL với tìm kiếm, trạng thái và cursor", async () => {
    mockGet.mockResolvedValue({ data: { data: { users: [], next_cursor: null } } });
    await searchVoucherPackageOwners("pkg-1", { q: "@matcha", status: "ACTIVE", cursor: "user-token" });
    expect(mockGet).toHaveBeenCalledWith("/api/admin/voucher-packages/pkg-1/owners", { params: { q: "@matcha", status: "ACTIVE", cursor: "user-token" } });
  });
});
