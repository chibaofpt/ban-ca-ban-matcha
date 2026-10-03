import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/api/client", () => ({
  apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { apiClient } from "@/src/lib/api/client";
import {
  createAdminRewardBox,
  createAdminRewardCampaign,
  deleteAdminRewardBox,
  getAdminRewardCampaign,
  getAdminWelcomeRewardSettings,
  listAdminRewardCampaigns,
  mutateAdminRewardCampaign,
  replaceAdminRewardPool,
  updateAdminRewardBox,
  updateAdminWelcomeRewardSettings,
} from "@/src/services/adminRewardService";

const SUMMARY = { id: "campaign-1", name: "Tháng 9", status: "DRAFT" as const, revision: 2, created_at: "2026-09-01", updated_at: "2026-09-02", draw_count: 0, total_allocated: 10, total_remaining: 10, box_count: 3 };
const DETAIL = { ...SUMMARY, pool_items: [], boxes: [{ id: "box-1", name: "Hộp 1", closed_image_url: "/closed.webp", open_image_url: "/open.webp", mouth_anchor_x: 0.25, mouth_anchor_y: 0.75, sort_order: 0 }] };

describe("adminRewardService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("đọc và cập nhật settings theo envelope hiện tại", async () => {
    const settings = { mode: "POINTS" as const, fixed_package_id: null, active_campaign_id: null, revision: 0 };
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: { settings } } });
    vi.mocked(apiClient.put).mockResolvedValueOnce({ data: { data: { settings: { ...settings, revision: 1 } } } });

    await expect(getAdminWelcomeRewardSettings()).resolves.toEqual(settings);
    await expect(updateAdminWelcomeRewardSettings(settings)).resolves.toEqual({ ...settings, revision: 1 });
    expect(apiClient.get).toHaveBeenCalledWith("/api/admin/welcome-reward-settings");
    expect(apiClient.put).toHaveBeenCalledWith("/api/admin/welcome-reward-settings", settings);
  });

  it("list, create và detail campaign dùng đúng URL và envelope", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: { items: [SUMMARY] } } }).mockResolvedValueOnce({ data: { data: { campaign: DETAIL } } });
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: { campaign: DETAIL } } });

    await expect(listAdminRewardCampaigns()).resolves.toEqual([SUMMARY]);
    await expect(createAdminRewardCampaign({ name: "Tháng 9" })).resolves.toEqual(DETAIL);
    await expect(getAdminRewardCampaign("campaign-1")).resolves.toEqual(DETAIL);
    expect(DETAIL.boxes[0]).toMatchObject({ mouth_anchor_x: 0.25, mouth_anchor_y: 0.75 });
    expect(apiClient.get).toHaveBeenNthCalledWith(1, "/api/admin/reward-campaigns");
    expect(apiClient.post).toHaveBeenCalledWith("/api/admin/reward-campaigns", { name: "Tháng 9" });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, "/api/admin/reward-campaigns/campaign-1");
  });

  it("gửi action và pool cùng revision", async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { data: { campaign: DETAIL } } });
    vi.mocked(apiClient.put).mockResolvedValue({ data: { data: { campaign: DETAIL } } });
    const action = { action: "RENAME" as const, revision: 2, name: "Mùa thu" };
    const pool = { revision: 2, items: [{ voucher_package_id: "package-1", quantity: 10, unlock_after_draws: 0 }] };

    await mutateAdminRewardCampaign("campaign-1", action);
    await replaceAdminRewardPool("campaign-1", pool);
    expect(apiClient.patch).toHaveBeenCalledWith("/api/admin/reward-campaigns/campaign-1", action);
    expect(apiClient.put).toHaveBeenCalledWith("/api/admin/reward-campaigns/campaign-1/pool", pool);
  });

  it("tạo và sửa box bằng FormData không truyền header thủ công", async () => {
    const closed = new File(["closed"], "closed.png", { type: "image/png" });
    const open = new File(["open"], "open.png", { type: "image/png" });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: { box: { id: "box-1" }, campaign: DETAIL } } });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { data: { box: { id: "box-1" }, campaign: DETAIL } } });

    await createAdminRewardBox("campaign-1", { revision: 2, name: "Hộp 1", mouth_anchor_x: 0.5, mouth_anchor_y: 0.2, closed_image: closed, open_image: open });
    await updateAdminRewardBox("campaign-1", "box-1", { revision: 3, mouth_anchor_y: 0.3, open_image: open });
    const createBody = vi.mocked(apiClient.post).mock.calls[0]?.[1];
    const updateBody = vi.mocked(apiClient.patch).mock.calls[0]?.[1];
    expect(apiClient.post).toHaveBeenCalledWith("/api/admin/reward-campaigns/campaign-1/boxes", expect.any(FormData));
    expect(apiClient.patch).toHaveBeenCalledWith("/api/admin/reward-campaigns/campaign-1/boxes/box-1", expect.any(FormData));
    expect(createBody).toBeInstanceOf(FormData);
    expect(Object.fromEntries((createBody as FormData).entries())).toMatchObject({ revision: "2", name: "Hộp 1", mouth_anchor_x: "0.5", mouth_anchor_y: "0.2", closed_image: closed, open_image: open });
    expect(Object.fromEntries((updateBody as FormData).entries())).toMatchObject({ revision: "3", mouth_anchor_y: "0.3", open_image: open });
  });

  it("xóa box bằng JSON revision và unwrap kết quả", async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: { data: { deleted: true, revision: 4 } } });
    await expect(deleteAdminRewardBox("campaign-1", "box-1", 3)).resolves.toEqual({ deleted: true, revision: 4 });
    expect(apiClient.delete).toHaveBeenCalledWith("/api/admin/reward-campaigns/campaign-1/boxes/box-1", { data: { revision: 3 } });
  });

  it("giữ status, code và details của revision conflict", async () => {
    vi.mocked(apiClient.get).mockRejectedValue({ response: { status: 409, data: { error: "Reward campaign conflict", code: "CONFLICT", details: { reason: "STALE_REVISION" } } } });
    await expect(getAdminRewardCampaign("campaign-1")).rejects.toMatchObject({ status: 409, code: "CONFLICT", details: { reason: "STALE_REVISION" } });
  });
});
