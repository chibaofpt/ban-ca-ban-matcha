import { describe, expect, it, vi } from "vitest";
import { persistOrderBundles } from "@/lib/orderBundleWrite";

function resolvedBundles() {
  return { line_discounts_vnd: [45_000, 45_000], skipped_qr_tokens: [], bundles: ["1", "2"].map((id) => ({
    voucher_id: `voucher-${id}`, package_id: `package-${id}`,
    qualifier_allocations: [{ client_line_id: `line-${id}`, quantity: 1 }],
    evaluation: { application_count: 1, total_discount_vnd: 45_000,
      rewards: [{ client_line_id: `line-${id}`, addon_option_id: null, quantity: 1, discount_vnd: 45_000 }] },
  })) };
}

describe("ghi nhận nhiều BUNDLE trong order", () => {
  it("claim atomically rồi lưu application, qualifier và reward", async () => {
    const tx = {
      voucher: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      orderBundleApplication: { create: vi.fn()
        .mockResolvedValueOnce({ id: "application-1" }).mockResolvedValueOnce({ id: "application-2" }) },
      orderBundleQualifierAllocation: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      orderBundleReward: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    await persistOrderBundles(tx as never, { order_id: "order-1",
      order_items: [{ id: "item-1", addons: [] }, { id: "item-2", addons: [] }],
      source_items: [{ client_line_id: "line-1" }, { client_line_id: "line-2" }],
      bundles: resolvedBundles(), redeem_immediately: false, performed_by: "staff-1" });

    expect(tx.voucher.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["voucher-1", "voucher-2"] }, status: "ACTIVE" }, data: { status: "RESERVED" },
    }));
    expect(tx.orderBundleApplication.create).toHaveBeenCalledTimes(2);
    expect(tx.orderBundleQualifierAllocation.createMany).toHaveBeenCalledTimes(2);
    expect(tx.orderBundleReward.createMany).toHaveBeenCalledTimes(2);
  });

  it("chặn double-spend nếu claim không đủ toàn bộ voucher", async () => {
    const tx = { voucher: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      orderBundleApplication: { create: vi.fn() },
      orderBundleQualifierAllocation: { createMany: vi.fn() }, orderBundleReward: { createMany: vi.fn() } };
    await expect(persistOrderBundles(tx as never, { order_id: "order-1",
      order_items: [], source_items: [], bundles: resolvedBundles(),
      redeem_immediately: false, performed_by: "staff-1" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(tx.orderBundleApplication.create).not.toHaveBeenCalled();
  });
});
