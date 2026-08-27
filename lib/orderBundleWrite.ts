import type { ResolvedOrderBundles } from "@/lib/orderBundle";
import { OrderValidationError } from "@/lib/orders";
import type { Prisma } from "@prisma/client";

interface PersistedOrderItem {
  id: string;
  addons: Array<{ id: string; addon_option_id: string }>;
}

type OrderBundleWriteTransaction = Pick<Prisma.TransactionClient,
  "voucher" | "orderBundleApplication" | "orderBundleQualifierAllocation" | "orderBundleReward">;

/** Claim and persist every applied BUNDLE voucher inside the caller's order transaction. */
export async function persistOrderBundles(
  tx: OrderBundleWriteTransaction,
  input: { order_id: string; order_items: PersistedOrderItem[];
    source_items: Array<{ client_line_id?: string }>; bundles: ResolvedOrderBundles;
    redeem_immediately: boolean; performed_by: string },
): Promise<void> {
  if (input.bundles.bundles.length === 0) return;
  const voucherIds = input.bundles.bundles.map((bundle) => bundle.voucher_id).sort();
  const voucherStatus = input.redeem_immediately ? "REDEEMED" : "RESERVED";
  const claim = await tx.voucher.updateMany({
    where: { id: { in: voucherIds }, status: "ACTIVE" },
    data: input.redeem_immediately
      ? { status: "REDEEMED", used_channel: "OFFLINE", redeemed_at: new Date(), redeemed_by: input.performed_by }
      : { status: "RESERVED" },
  });
  if (claim.count !== voucherIds.length) {
    throw new OrderValidationError("CONFLICT", "One or more BUNDLE vouchers changed concurrently.");
  }
  const orderItemByLine = new Map<string, PersistedOrderItem>();
  input.source_items.forEach((source, index) => {
    if (source.client_line_id && input.order_items[index]) orderItemByLine.set(source.client_line_id, input.order_items[index]!);
  });
  for (const bundle of [...input.bundles.bundles].sort((a, b) => a.voucher_id.localeCompare(b.voucher_id))) {
    const application = await tx.orderBundleApplication.create({ data: {
      order_id: input.order_id, voucher_id: bundle.voucher_id,
      application_count: bundle.evaluation.application_count, status: voucherStatus,
    } });
    const qualifierRows = bundle.qualifier_allocations.map((allocation) => {
      const item = orderItemByLine.get(allocation.client_line_id);
      if (!item) throw new OrderValidationError("VALIDATION_ERROR", "Missing persisted BUNDLE qualifier line.");
      return { application_id: application.id, order_item_id: item.id, quantity: allocation.quantity };
    });
    if (qualifierRows.length > 0) {
      await tx.orderBundleQualifierAllocation.createMany({ data: qualifierRows });
    }
    const rewardRows = bundle.evaluation.rewards.map((reward) => {
      const item = orderItemByLine.get(reward.client_line_id);
      if (!item) throw new OrderValidationError("VALIDATION_ERROR", "Missing persisted BUNDLE reward line.");
      const addon = reward.addon_option_id
        ? item.addons.find((candidate) => candidate.addon_option_id === reward.addon_option_id)
        : null;
      if (reward.addon_option_id && !addon) {
        throw new OrderValidationError("VALIDATION_ERROR", "Missing persisted BUNDLE reward addon.");
      }
      return { application_id: application.id, order_item_id: addon ? null : item.id,
        order_item_addon_id: addon?.id ?? null, quantity: reward.quantity, discount_vnd: reward.discount_vnd };
    });
    if (rewardRows.length > 0) await tx.orderBundleReward.createMany({ data: rewardRows });
  }
}
