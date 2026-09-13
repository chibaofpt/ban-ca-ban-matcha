import { describe, expect, it, vi } from "vitest";
import { createAdminRewardBox, updateAdminRewardBox } from "@/lib/adminRewardBox";
import type { AdminRewardDatabase } from "@/lib/adminRewardCampaign";

vi.mock("@/lib/voucherAvailability", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/voucherAvailability")>(),
  loadVoucherAvailabilityCatalog: vi.fn().mockResolvedValue({}),
}));

describe("Workflow lưu reward box", () => {
  it("xóa cả hai upload mới khi transaction DB rollback", async () => {
    const upload = vi.fn()
      .mockResolvedValueOnce("https://storage/closed.webp")
      .mockResolvedValueOnce("https://storage/open.webp");
    const remove = vi.fn().mockResolvedValue(undefined);
    const db = { $transaction: vi.fn().mockRejectedValue(new Error("db failed")) } as unknown as AdminRewardDatabase;

    await expect(createAdminRewardBox(db, {
      campaignId: "campaign", revision: 0,
      fields: { name: "Hộp sen", mouth_anchor_x: 0.5, mouth_anchor_y: 0.2 },
      closedImage: new File(["a"], "closed.png", { type: "image/png" }),
      openImage: new File(["b"], "open.png", { type: "image/png" }),
    }, { uploadMenuImage: upload, removeMenuImages: remove })).rejects.toThrow("db failed");

    expect(remove).toHaveBeenCalledWith([
      expect.stringMatching(/closed-[a-z0-9]{8}\.webp$/),
      expect.stringMatching(/open-[a-z0-9]{8}\.webp$/),
    ]);
  });

  it("không xóa upload đã được DB commit khi detail read phía sau thất bại", async () => {
    const upload = vi.fn()
      .mockResolvedValueOnce("https://storage/closed.webp")
      .mockResolvedValueOnce("https://storage/open.webp");
    const remove = vi.fn().mockResolvedValue(undefined);
    const tx = {
      rewardCampaign: {
        findUnique: vi.fn().mockResolvedValue({ status: "DRAFT", boxes: [], poolItems: [] }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      rewardBox: { create: vi.fn().mockResolvedValue({ id: "box" }) },
    };
    const db = {
      ...tx,
      $transaction: vi.fn((callback) => callback(tx)),
      rewardCampaign: { ...tx.rewardCampaign, findUnique: vi.fn().mockRejectedValue(new Error("read failed")) },
      rewardOutcome: { groupBy: vi.fn() },
    } as unknown as AdminRewardDatabase;

    await expect(createAdminRewardBox(db, {
      campaignId: "campaign", revision: 0,
      fields: { name: "Hộp sen", mouth_anchor_x: 0.5, mouth_anchor_y: 0.2 },
      closedImage: new File(["a"], "closed.png", { type: "image/png" }),
      openImage: new File(["b"], "open.png", { type: "image/png" }),
    }, { uploadMenuImage: upload, removeMenuImages: remove })).rejects.toThrow("read failed");

    expect(tx.rewardBox.create).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
  });

  it("sau replacement thành công chỉ xóa best-effort path ảnh cũ đã thay", async () => {
    const baseUrl = "https://project.supabase.co/storage/v1/object/public/menu-images/";
    const before = {
      id: "box", name: "Hộp cũ", closed_image_url: `${baseUrl}products/reward-boxes/old-closed.webp`,
      open_image_url: `${baseUrl}products/reward-boxes/old-open.webp`, mouth_anchor_x: 0.5, mouth_anchor_y: 0.2, sort_order: 0,
    };
    const updated = { ...before, closed_image_url: `${baseUrl}products/reward-boxes/new-closed.webp` };
    const campaign = {
      id: "campaign", name: "Tết", status: "DRAFT", revision: 2,
      created_at: new Date("2026-01-01"), updated_at: new Date("2026-01-02"),
      poolItems: [], boxes: [updated],
    };
    const tx = {
      rewardCampaign: { findUnique: vi.fn().mockResolvedValue(campaign), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      rewardBox: { findFirst: vi.fn().mockResolvedValue(before), update: vi.fn().mockResolvedValue(updated) },
    };
    const db = {
      rewardBox: { findFirst: vi.fn().mockResolvedValue(before) },
      rewardCampaign: { findUnique: vi.fn().mockResolvedValue(campaign) },
      rewardOutcome: { groupBy: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((callback) => callback(tx)),
    } as unknown as AdminRewardDatabase;
    const upload = vi.fn().mockResolvedValue(updated.closed_image_url);
    const remove = vi.fn().mockResolvedValue(undefined);

    await updateAdminRewardBox(db, {
      campaignId: "campaign", boxId: "box", revision: 1, fields: {},
      closedImage: new File(["new"], "closed.png", { type: "image/png" }),
    }, { uploadMenuImage: upload, removeMenuImages: remove });

    expect(remove).toHaveBeenCalledWith(["products/reward-boxes/old-closed.webp"]);
    expect(remove).not.toHaveBeenCalledWith(expect.arrayContaining(["products/reward-boxes/old-open.webp"]));
  });
});
