import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminRewardError,
  getAdminRewardCampaign,
  listAdminRewardCampaigns,
  mutateAdminRewardCampaign,
  replaceAdminRewardPool,
  resolveCampaignTransition,
  toAdminRewardBoxDto,
  validateRewardPoolItems,
  type AdminRewardDatabase,
} from "@/lib/adminRewardCampaign";
import type { VoucherAvailabilityCatalog } from "@/lib/voucherAvailability";

const liveCatalog: VoucherAvailabilityCatalog = {
  powders: [], baseLiquids: [], addonOptions: [],
  menuItems: [
    { id: "on", name: "Bánh còn bán", category: "extras", is_available: true, unit_price_vnd: 25_000,
      matcha_powder_id: null, default_powder_id: null, default_base_liquid_id: null,
      allowed_powder_ids: [], allowed_base_liquid_ids: [], sizes: [] },
    { id: "off", name: "Bánh đã nghỉ", category: "extras", is_available: false, unit_price_vnd: 25_000,
      matcha_powder_id: null, default_powder_id: null, default_base_liquid_id: null,
      allowed_powder_ids: [], allowed_base_liquid_ids: [], sizes: [] },
  ],
};

function withCatalog<T extends object>(db: T) {
  return {
    ...db,
    menuItem: { findMany: vi.fn().mockResolvedValue(liveCatalog.menuItems.map((item) => ({
      ...item, fusionAllowedPowders: item.allowed_powder_ids.map((powder_id) => ({ powder_id })),
      allowedBaseLiquids: item.allowed_base_liquid_ids.map((base_liquid_id) => ({ base_liquid_id })),
    }))) },
    matchaPowder: { findMany: vi.fn().mockResolvedValue(liveCatalog.powders) },
    milkType: { findMany: vi.fn().mockResolvedValue(liveCatalog.baseLiquids) },
    addonOption: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

describe("Quy tắc cấu hình reward campaign", () => {
  it("project Decimal-like anchor thành number bằng mapper dùng chung", () => {
    expect(toAdminRewardBoxDto({
      id: "box", name: "Hộp", closed_image_url: "closed", open_image_url: "open",
      mouth_anchor_x: { toString: () => "0.375" }, mouth_anchor_y: "0.625", sort_order: 2,
    })).toEqual({
      id: "box", name: "Hộp", closed_image_url: "closed", open_image_url: "open",
      mouth_anchor_x: 0.375, mouth_anchor_y: 0.625, sort_order: 2,
    });
  });
  it("chấp nhận threshold 60 khi có đúng 60 phần quà mở trước đó", () => {
    expect(validateRewardPoolItems([
      { voucher_package_id: "early", quantity: 60, unlock_after_draws: 0 },
      { voucher_package_id: "rare", quantity: 10, unlock_after_draws: 60 },
    ])).toBe(70);
  });

  it("từ chối threshold 60 khi chỉ có 50 phần quà mở trước đó", () => {
    expect(() => validateRewardPoolItems([
      { voucher_package_id: "early", quantity: 50, unlock_after_draws: 0 },
      { voucher_package_id: "rare", quantity: 10, unlock_after_draws: 60 },
    ])).toThrowError(expect.objectContaining<Partial<AdminRewardError>>({
      reason: "UNREACHABLE_UNLOCK_THRESHOLD",
    }));
  });

  it("chỉ cho phép các chuyển trạng thái đã đóng băng", () => {
    expect(resolveCampaignTransition("DRAFT", "ACTIVATE")).toBe("ACTIVE");
    expect(resolveCampaignTransition("ACTIVE", "PAUSE")).toBe("PAUSED");
    expect(resolveCampaignTransition("PAUSED", "RESUME")).toBe("ACTIVE");
    expect(resolveCampaignTransition("PAUSED", "END")).toBe("ENDED");
    expect(() => resolveCampaignTransition("ENDED", "RESUME")).toThrowError(
      expect.objectContaining<Partial<AdminRewardError>>({ reason: "INVALID_TRANSITION" }),
    );
  });
});

function campaignRecord(status: "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED" = "DRAFT") {
  return {
    id: "campaign", name: "Tết", status, revision: 1,
    created_at: new Date("2026-01-01"), updated_at: new Date("2026-01-02"),
    poolItems: [{
      id: "pool", voucher_package_id: "package", quantity: 5, unlock_after_draws: 0,
      created_at: new Date("2026-01-01"),
      voucherPackage: {
        id: "package", name: "Quà", is_active: true, ends_at: null, voucher_type: "DISCOUNT",
        menu_item_id: null, size: null, eligible_sizes: [], reference_size: null, product_discount_mode: null,
        menuItemScopes: [], matcha_powder_id: null, milk_type_id: null, addon_option_id: null,
        addonOptionScopes: [], bundleRule: null,
      },
    }],
    boxes: Array.from({ length: 3 }, (_, sort_order) => ({
      id: `box-${sort_order}`, name: "Hộp", closed_image_url: "closed", open_image_url: "open",
      mouth_anchor_x: 0.5, mouth_anchor_y: 0.2, sort_order,
    })),
  } as const;
}

describe("Workflow quản trị reward campaign", () => {
  beforeEach(() => vi.clearAllMocks());
  it("tách draw đã commit và weight còn đủ điều kiện", async () => {
    const record = campaignRecord();
    const campaign = {
      ...record,
      poolItems: [{
        ...record.poolItems[0],
        voucherPackage: {
          ...record.poolItems[0].voucherPackage,
          ends_at: new Date("2026-12-31T00:00:00.000Z"),
        },
      }],
    };
    const db = withCatalog({
      rewardCampaign: { findUnique: vi.fn().mockResolvedValue(campaign) },
      rewardOutcome: { groupBy: vi.fn().mockResolvedValue([{ campaign_id: "campaign", pool_item_id: "pool", _count: { _all: 3 } }]) },
    }) as unknown as AdminRewardDatabase;
    const detail = await getAdminRewardCampaign(db, "campaign", new Date("2026-01-03"));
    expect(detail).toMatchObject({
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
      draw_count: 3,
      total_allocated: 5,
      total_remaining: 2,
      box_count: 3,
    });
    expect(detail.pool_items[0]).toMatchObject({ issued_count: 3, remaining_quantity: 2, unlocked: true, current_weight: 2, eligible_weight_total: 2 });
    expect(detail.pool_items[0].voucher_package.ends_at).toBe("2026-12-31T00:00:00.000Z");
  });

  it("đặt weight 0 cho target unavailable và denominator chỉ gồm target usable", async () => {
    const record = campaignRecord();
    const campaign = {
      ...record,
      poolItems: [
        { ...record.poolItems[0], id: "unavailable", quantity: 99, voucherPackage: { ...record.poolItems[0].voucherPackage, id: "unavailable", voucher_type: "ITEM", menu_item_id: "off" } },
        { ...record.poolItems[0], id: "usable", voucher_package_id: "usable", quantity: 1, voucherPackage: { ...record.poolItems[0].voucherPackage, id: "usable", voucher_type: "ITEM", menu_item_id: "on" } },
      ],
    };
    const db = withCatalog({
      rewardCampaign: { findUnique: vi.fn().mockResolvedValue(campaign) },
      rewardOutcome: { groupBy: vi.fn().mockResolvedValue([]) },
    }) as unknown as AdminRewardDatabase;

    const detail = await getAdminRewardCampaign(db, "campaign");

    expect(detail.pool_items).toEqual([
      expect.objectContaining({ id: "unavailable", remaining_quantity: 99, unlocked: true, current_weight: 0, eligible_weight_total: 1 }),
      expect.objectContaining({ id: "usable", remaining_quantity: 1, unlocked: true, current_weight: 1, eligible_weight_total: 1 }),
    ]);
    expect(db.menuItem.findMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    { voucher_type: "DISCOUNT", is_active: true, ends_at: null, expected: 5 },
    { voucher_type: "FREESHIP", is_active: true, ends_at: null, expected: 5 },
    { voucher_type: "DISCOUNT", is_active: false, ends_at: null, expected: 0 },
    { voucher_type: "FREESHIP", is_active: true, ends_at: new Date("2026-01-02"), expected: 0 },
  ])("project weight package $voucher_type theo lifecycle và canonical resolver", async ({ voucher_type, is_active, ends_at, expected }) => {
    const record = campaignRecord();
    const campaign = { ...record, poolItems: [{
      ...record.poolItems[0], voucherPackage: { ...record.poolItems[0].voucherPackage, voucher_type, is_active, ends_at },
    }] };
    const db = withCatalog({
      rewardCampaign: { findUnique: vi.fn().mockResolvedValue(campaign) },
      rewardOutcome: { groupBy: vi.fn().mockResolvedValue([]) },
    }) as unknown as AdminRewardDatabase;
    const detail = await getAdminRewardCampaign(db, "campaign", new Date("2026-01-03"));
    expect(detail.pool_items[0]).toMatchObject({ current_weight: expected, eligible_weight_total: expected });
  });

  it("list campaign chỉ load một catalog cho mọi campaign", async () => {
    const first = campaignRecord();
    const second = { ...campaignRecord("ACTIVE"), id: "campaign-2" };
    const db = withCatalog({
      rewardCampaign: { findMany: vi.fn().mockResolvedValue([first, second]) },
      rewardOutcome: { groupBy: vi.fn().mockResolvedValue([]) },
    }) as unknown as AdminRewardDatabase;
    await expect(listAdminRewardCampaigns(db)).resolves.toHaveLength(2);
    expect(db.menuItem.findMany).toHaveBeenCalledTimes(1);
  });

  it("replace pool claim revision rồi xóa và tạo trong cùng transaction", async () => {
    const tx = withCatalog({
      rewardCampaign: { findUnique: vi.fn().mockResolvedValue(campaignRecord()), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      voucherPackage: { findMany: vi.fn().mockResolvedValue([{ id: "package", name: "Quà", is_active: true, ends_at: null }]) },
      rewardPoolItem: { deleteMany: vi.fn(), createMany: vi.fn() },
      rewardOutcome: { groupBy: vi.fn().mockResolvedValue([]) },
    });
    const db = { ...tx, $transaction: vi.fn((callback) => callback(tx)) } as unknown as AdminRewardDatabase;
    await replaceAdminRewardPool(db, "campaign", 1, [{ voucher_package_id: "package", quantity: 60, unlock_after_draws: 0 }]);
    expect(tx.rewardCampaign.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "campaign", status: "DRAFT", revision: 1 } }));
    expect(tx.rewardPoolItem.deleteMany).toHaveBeenCalledBefore(tx.rewardPoolItem.createMany);
  });

  it("activation kiểm tra readiness và trả conflict khi conditional update thua", async () => {
    const tx = withCatalog({
      rewardCampaign: { findUnique: vi.fn().mockResolvedValue(campaignRecord()), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      voucherPackage: { findMany: vi.fn().mockResolvedValue([{ id: "package", name: "Quà", is_active: true, ends_at: null }]) },
    });
    const db = { ...tx, $transaction: vi.fn((callback) => callback(tx)) } as unknown as AdminRewardDatabase;
    await expect(mutateAdminRewardCampaign(db, "campaign", { action: "ACTIVATE", revision: 0 }))
      .rejects.toSatisfy((error: unknown) => error instanceof AdminRewardError && error.reason === "CONFLICT");
  });

  it.each([
    { action: "ACTIVATE" as const, status: "DRAFT" as const },
    { action: "RESUME" as const, status: "PAUSED" as const },
  ])("$action từ chối package active nhưng live target unavailable", async ({ action, status }) => {
    const record = campaignRecord(status);
    const unavailableCampaign = {
      ...record,
      poolItems: record.poolItems.map((item) => ({
        ...item,
        voucherPackage: { ...item.voucherPackage, voucher_type: "ITEM", menu_item_id: "off" },
      })),
    };
    const tx = withCatalog({
      rewardCampaign: { findUnique: vi.fn().mockResolvedValue(unavailableCampaign), updateMany: vi.fn() },
      voucherPackage: { findMany: vi.fn().mockResolvedValue([{ id: "package", name: "Quà", is_active: true, ends_at: null }]) },
    });
    const db = { ...tx, $transaction: vi.fn((callback) => callback(tx)) } as unknown as AdminRewardDatabase;

    await expect(mutateAdminRewardCampaign(db, "campaign", { action, revision: 1 }))
      .rejects.toSatisfy((error: unknown) => error instanceof AdminRewardError && error.reason === "PACKAGE_UNAVAILABLE");
    expect(tx.menuItem.findMany).toHaveBeenCalledTimes(1);
    expect(tx.rewardCampaign.updateMany).not.toHaveBeenCalled();
  });

  it("activation với live target usable chỉ load catalog một lần", async () => {
    const tx = withCatalog({
      rewardCampaign: { findUnique: vi.fn().mockResolvedValue(campaignRecord()), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      voucherPackage: { findMany: vi.fn().mockResolvedValue([{ id: "package", name: "Quà", is_active: true, ends_at: null }]) },
      rewardOutcome: { groupBy: vi.fn().mockResolvedValue([]) },
    });
    const db = { ...tx, $transaction: vi.fn((callback) => callback(tx)) } as unknown as AdminRewardDatabase;

    await expect(mutateAdminRewardCampaign(db, "campaign", { action: "ACTIVATE", revision: 1 })).resolves.toBeTruthy();
    expect(tx.menuItem.findMany).toHaveBeenCalledTimes(1);
  });
});
