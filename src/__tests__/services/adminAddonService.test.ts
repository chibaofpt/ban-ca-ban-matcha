import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();

vi.mock("@/src/lib/api/client", () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
  },
}));

import {
  createAddonOption,
  reorderAddonGroups,
  toggleAddonGroupActive,
  updateAddonGroupDetails,
  updateAddonOptionDetails,
} from "@/src/services/adminAddonService";

const groupId = "11111111-1111-4111-8111-111111111111";
const optionId = "22222222-2222-4222-8222-222222222222";
const group = { id: groupId, sort_order: 0, options: [] };

describe("adminAddonService focused mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ data: { data: group } });
    mockPut.mockResolvedValue({ data: { data: group } });
  });

  it("sends only group details in the inline edit multipart payload", async () => {
    await updateAddonGroupDetails(groupId, {
      name: "Kem",
      description: null,
      max_select: 2,
    });

    const [, body] = mockPut.mock.calls[0] as [string, FormData];
    expect(JSON.parse(body.get("payload") as string)).toEqual({
      name: "Kem",
      description: null,
      max_select: 2,
    });
  });

  it("uses child routes for option create and details update", async () => {
    await createAddonOption(groupId, {
      label: "Kem sua",
      price_vnd: 10_000,
      gram_value: null,
      is_active: true,
    });
    await updateAddonOptionDetails(groupId, optionId, {
      label: "Kem sua moi",
      price_vnd: 11_000,
      gram_value: null,
    });

    expect(mockPost.mock.calls[0]?.[0]).toBe(`/api/admin/addon-groups/${groupId}/options`);
    expect(mockPut.mock.calls[0]?.[0]).toBe(`/api/admin/addon-groups/${groupId}/options/${optionId}`);
  });

  it("submits the complete nested catalogue to the reorder endpoint", async () => {
    mockPut.mockResolvedValue({ data: { data: [group] } });
    const payload = [{ id: groupId, option_ids: [optionId] }];

    await reorderAddonGroups(payload);

    expect(mockPut).toHaveBeenCalledWith("/api/admin/addon-groups/reorder", { groups: payload });
  });

  it("giữ thông báo dễ đọc và metadata của business-rule error", async () => {
    mockPut.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 422,
        data: {
          error: "Nhóm đang hiển thị phải có ít nhất một option đang bật",
          code: "BUSINESS_RULE_VIOLATION",
          details: { reason: "ACTIVE_GROUP_REQUIRES_ACTIVE_OPTION" },
        },
      },
    });

    await expect(toggleAddonGroupActive(groupId, true)).rejects.toMatchObject({
      message: "Nhóm đang hiển thị phải có ít nhất một option đang bật",
      status: 422,
      code: "BUSINESS_RULE_VIOLATION",
      details: { reason: "ACTIVE_GROUP_REQUIRES_ACTIVE_OPTION" },
    });
  });
});
