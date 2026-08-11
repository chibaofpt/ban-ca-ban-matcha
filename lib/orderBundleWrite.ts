import type { ResolvedOrderBundle } from "@/lib/orderBundle";
import { OrderValidationError } from "@/lib/orders";
import type { Prisma } from "@prisma/client";

interface PersistedOrderItem {
  id: string;
  addons: Array<{ id: string; addon_option_id: string }>;
}

type OrderBundleWriteTransaction = Pick<
  Prisma.TransactionClient,
  "voucher" | "orderPromotionApplication" | "orderPromotionReward"
>;

/** Persist one evaluated BUNDLE and claim its voucher inside the caller transaction. */
export async function persistOrderBundle(
  tx: OrderBundleWriteTransaction,
  input: {
    order_id: string;
    order_items: PersistedOrderItem[];
    source_items: Array<{ client_line_id?: string }>;
    bundle: ResolvedOrderBundle;
    redeem_immediately: boolean;
    performed_by: string;
  },
): Promise<void> {
  const { bundle } = input;
  if (bundle.promotion_max_redemptions !== null) {
    const used = await tx.orderPromotionApplication.aggregate({
      where: {
        promotion_id: bundle.promotion_id,
        status: { in: ["RESERVED", "REDEEMED"] },
      },
      _sum: { application_count: true },
    });
    if (
      (used._sum.application_count ?? 0) + bundle.evaluation.application_count >
      bundle.promotion_max_redemptions
    ) {
      throw new OrderValidationError("BUNDLE_SOLD_OUT", "Promotion redemption limit reached.");
    }
  }

  const voucherStatus = input.redeem_immediately ? "REDEEMED" : "RESERVED";
  const voucherClaim = await tx.voucher.updateMany({
    where: { id: bundle.voucher_id, status: "ACTIVE" },
    data: input.redeem_immediately
      ? {
          status: "REDEEMED",
          used_channel: "OFFLINE",
          redeemed_at: new Date(),
          redeemed_by: input.performed_by,
        }
      : { status: "RESERVED" },
  });
  if (voucherClaim.count !== 1) {
    throw new OrderValidationError("CONFLICT", "BUNDLE voucher changed concurrently.");
  }

  const application = await tx.orderPromotionApplication.create({
    data: {
      order_id: input.order_id,
      voucher_id: bundle.voucher_id,
      promotion_id: bundle.promotion_id,
      application_count: bundle.evaluation.application_count,
      status: voucherStatus,
    },
  });
  for (const reward of bundle.evaluation.rewards) {
    const sourceIndex = input.source_items.findIndex(
      (item) => item.client_line_id === reward.client_line_id,
    );
    const orderItem = input.order_items[sourceIndex];
    if (!orderItem) {
      throw new OrderValidationError("VALIDATION_ERROR", "Missing persisted BUNDLE line.");
    }
    const orderItemAddon = reward.addon_option_id
      ? orderItem.addons.find((addon) => addon.addon_option_id === reward.addon_option_id)
      : null;
    if (reward.addon_option_id && !orderItemAddon) {
      throw new OrderValidationError("VALIDATION_ERROR", "Missing persisted BUNDLE addon.");
    }
    await tx.orderPromotionReward.create({
      data: {
        application_id: application.id,
        order_item_id: reward.addon_option_id ? null : orderItem.id,
        order_item_addon_id: orderItemAddon?.id ?? null,
        quantity: reward.quantity,
        discount_vnd: reward.discount_vnd,
      },
    });
  }
}
