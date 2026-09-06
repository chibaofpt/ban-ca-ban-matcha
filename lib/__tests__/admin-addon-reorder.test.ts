import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockTransaction = vi.fn();
const mockGroupFindMany = vi.fn();
const mockGroupUpdate = vi.fn();
const mockOptionUpdate = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (...args: unknown[]) => mockTransaction(...args) },
}));
vi.mock("@/lib/cacheInvalidation", () => ({ invalidateMenuCaches: vi.fn() }));

import { PUT } from "@/app/api/admin/addon-groups/reorder/route";

const groupA = "11111111-1111-4111-8111-111111111111";
const groupB = "22222222-2222-4222-8222-222222222222";
const optionA = "33333333-3333-4333-8333-333333333333";
const optionB = "44444444-4444-4444-8444-444444444444";

const snapshot = [
  { id: groupA, options: [{ id: optionA }] },
  { id: groupB, options: [{ id: optionB }] },
];

const result = snapshot.map((group, index) => ({
  ...group,
  name: `Group ${index}`,
  description: null,
  image_url: null,
  sort_order: index,
  max_select: 1,
  is_dynamic_gram: false,
  is_active: true,
  created_at: new Date("2026-09-05T00:00:00.000Z"),
  options: group.options.map((option) => ({
    ...option,
    addon_group_id: group.id,
    label: "Option",
    image_url: null,
    price_vnd: 5_000,
    is_active: true,
    sort_order: 0,
    gram_value: null,
  })),
}));

function request(groups: Array<{ id: string; option_ids: string[] }>): Request {
  return new Request("http://localhost/api/admin/addon-groups/reorder", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ groups }),
  });
}

describe("PUT /api/admin/addon-groups/reorder", () => {
  const tx = {
    addonGroup: { findMany: mockGroupFindMany, update: mockGroupUpdate },
    addonOption: { update: mockOptionUpdate },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ role: "ADMIN" });
    mockTransaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    mockGroupFindMany.mockResolvedValueOnce(snapshot).mockResolvedValueOnce(result);
    mockGroupUpdate.mockResolvedValue({});
    mockOptionUpdate.mockResolvedValue({});
  });

  it("derives dense ranks for every group and nested option", async () => {
    const response = await PUT(request([
      { id: groupB, option_ids: [optionB] },
      { id: groupA, option_ids: [optionA] },
    ]));

    expect(response.status).toBe(200);
    expect(mockGroupUpdate).toHaveBeenCalledWith({
      where: { id: groupB },
      data: { sort_order: 0 },
    });
    expect(mockGroupUpdate).toHaveBeenCalledWith({
      where: { id: groupA },
      data: { sort_order: 1 },
    });
    expect(mockOptionUpdate).toHaveBeenCalledTimes(2);
    expect(mockTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable" }),
    );
  });

  it("returns 409 when the submitted catalogue is stale or incomplete", async () => {
    const response = await PUT(request([
      { id: groupA, option_ids: [optionA] },
    ]));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "CONFLICT",
      details: { reason: "ADDON_CATALOG_MEMBERSHIP_CHANGED" },
    });
    expect(mockGroupUpdate).not.toHaveBeenCalled();
  });

  it("returns 409 when an option is submitted under the wrong group", async () => {
    const response = await PUT(request([
      { id: groupA, option_ids: [optionB] },
      { id: groupB, option_ids: [optionA] },
    ]));

    expect(response.status).toBe(409);
    expect(mockOptionUpdate).not.toHaveBeenCalled();
  });
});
