import { describe, expect, it, vi } from "vitest";
import { persistOrderBundle } from "@/lib/orderBundleWrite";

function bundle(maxRedemptions: number | null = null) {
  return {
    voucher_id: "voucher-1",
    promotion_id: "promotion-1",
    promotion_max_redemptions: maxRedemptions,
    line_discounts_vnd: [45_000],
    evaluation: {
      application_count: 1,
      total_discount_vnd: 45_000,
      rewards: [
        { client_line_id: "line-1", addon_option_id: null, quantity: 1, discount_vnd: 45_000 },
      ],
    },
  };
}

describe("ghi nhận BUNDLE dùng chung", () => {
  it("khóa voucher và tạo reward nguồn-sự-thật cho order pending", async () => {
    const voucherUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const applicationCreate = vi.fn().mockResolvedValue({ id: "application-1" });
    const rewardCreate = vi.fn().mockResolvedValue({});
    const tx = {
      voucher: { updateMany: voucherUpdateMany },
      orderPromotionApplication: {
        aggregate: vi.fn(),
        create: applicationCreate,
      },
      orderPromotionReward: { create: rewardCreate },
    };

    await persistOrderBundle(tx as never, {
      order_id: "order-1",
      order_items: [{ id: "item-1", addons: [] }],
      source_items: [{ client_line_id: "line-1" }],
      bundle: bundle(),
      redeem_immediately: false,
      performed_by: "staff-1",
    });

    expect(voucherUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "voucher-1", status: "ACTIVE" }, data: { status: "RESERVED" } }),
    );
    expect(applicationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "RESERVED" }) }),
    );
    expect(rewardCreate).toHaveBeenCalledOnce();
  });

  it("từ chối atomically khi campaign đã hết lượt", async () => {
    const voucherUpdateMany = vi.fn();
    const tx = {
      voucher: { updateMany: voucherUpdateMany },
      orderPromotionApplication: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { application_count: 2 } }),
        create: vi.fn(),
      },
      orderPromotionReward: { create: vi.fn() },
    };

    await expect(
      persistOrderBundle(tx as never, {
        order_id: "order-1",
        order_items: [{ id: "item-1", addons: [] }],
        source_items: [{ client_line_id: "line-1" }],
        bundle: bundle(2),
        redeem_immediately: false,
        performed_by: "staff-1",
      }),
    ).rejects.toMatchObject({ code: "BUNDLE_SOLD_OUT" });
    expect(voucherUpdateMany).not.toHaveBeenCalled();
  });
});
