import {
  BundlePromotionError,
  evaluateBundlePromotion,
  type BundleEvaluationResult,
  type BundlePromotionRule,
  type BundleRewardAllocation,
} from "@/lib/promotionBundle";

interface BundleScopeRecord {
  role: "QUALIFIER" | "REWARD";
  menu_item_id: string;
  size: "SMALL" | "MEDIUM" | "LARGE" | null;
  matcha_powder_id: string | null;
  milk_type_id: string | null;
  reference_price_vnd: number | null;
}

interface BundleRuleRecord {
  buy_quantity: number;
  reward_quantity: number;
  reward_kind: "PRODUCT" | "ADDON";
  reward_mode: "SAME_CONFIG" | "FIXED_CONFIG" | "ALLOWED_SCOPE";
  benefit_scaling: "PER_BUNDLE" | "ONCE_PER_ORDER" | "PER_QUALIFYING_ITEM";
  max_applications_order: number;
  max_reward_units_order: number | null;
  productScopes: BundleScopeRecord[];
  addonRewards: Array<{ addon_option_id: string }>;
}

interface BundleVoucherRecord {
  id: string;
  user_id: string;
  voucher_type: string;
  status: string;
  expires_at: Date | null;
  package: {
    promotion: {
      id: string;
      is_active: boolean;
      starts_at: Date;
      ends_at: Date;
      published_at: Date | null;
      max_redemptions: number | null;
      bundleRule: BundleRuleRecord | null;
    } | null;
  };
}

export interface OrderBundleDatabase {
  voucher: {
    findUnique: (args: unknown) => Promise<BundleVoucherRecord | null>;
  };
}

interface BundleOrderItemInput {
  client_line_id?: string;
  product_voucher_id?: string;
  addon_voucher_ids: Array<{ voucher_id: string; addon_option_id: string }>;
}

interface BundleResolvedItem {
  menu_item_id: string;
  size: "SMALL" | "MEDIUM" | "LARGE";
  selected_powder_id: string;
  selected_milk_type_id: string | null;
  unit_price_vnd: number;
  quantity: number;
  resolvedAddons: Array<{
    addon_option_id: string;
    quantity: number;
    unit_price_vnd: number;
    gram_value: number | null;
  }>;
}

export interface ResolvedOrderBundle {
  voucher_id: string;
  promotion_id: string;
  promotion_max_redemptions: number | null;
  evaluation: BundleEvaluationResult;
  line_discounts_vnd: number[];
}

function toRule(record: BundleRuleRecord): BundlePromotionRule {
  const scopes = record.productScopes.map((scope) => ({
    menu_item_id: scope.menu_item_id,
    size: scope.size,
    powder_id: scope.matcha_powder_id,
    milk_type_id: scope.milk_type_id,
    ...(scope.reference_price_vnd === null
      ? {}
      : { reference_price_vnd: scope.reference_price_vnd }),
  }));
  return {
    buy_quantity: record.buy_quantity,
    reward_quantity: record.reward_quantity,
    reward_kind: record.reward_kind,
    reward_mode: record.reward_mode,
    benefit_scaling: record.benefit_scaling,
    max_applications_per_order: record.max_applications_order,
    max_reward_units_per_order: record.max_reward_units_order,
    qualifier_scopes: scopes.filter((_, index) => record.productScopes[index]?.role === "QUALIFIER"),
    reward_product_scopes: scopes.filter((_, index) => record.productScopes[index]?.role === "REWARD"),
    reward_addon_option_ids: record.addonRewards.map((reward) => reward.addon_option_id),
  };
}

function assertVoucherUsable(
  voucher: BundleVoucherRecord | null,
  userId: string,
  now: Date,
): asserts voucher is BundleVoucherRecord & {
  package: { promotion: NonNullable<BundleVoucherRecord["package"]["promotion"]> };
} {
  if (!voucher || voucher.user_id !== userId) {
    throw new BundlePromotionError("BUNDLE_VOUCHER_NOT_FOUND", "Bundle voucher not found");
  }
  if (voucher.voucher_type !== "BUNDLE" || voucher.status !== "ACTIVE") {
    throw new BundlePromotionError("BUNDLE_VOUCHER_UNAVAILABLE", "Bundle voucher is unavailable");
  }
  if (voucher.expires_at && voucher.expires_at <= now) {
    throw new BundlePromotionError("BUNDLE_VOUCHER_EXPIRED", "Bundle voucher is expired");
  }
  const promotion = voucher.package.promotion;
  if (
    !promotion ||
    !promotion.published_at ||
    !promotion.is_active ||
    now < promotion.starts_at ||
    now >= promotion.ends_at ||
    !promotion.bundleRule
  ) {
    throw new BundlePromotionError("BUNDLE_PROMOTION_INACTIVE", "Bundle promotion is inactive");
  }
}

/** Resolve one public BUNDLE token against server-priced order lines. */
export async function resolveOrderBundle(
  db: OrderBundleDatabase,
  input: {
    qr_token: string;
    user_id: string;
    now?: Date;
    items: BundleOrderItemInput[];
    resolved_items: BundleResolvedItem[];
    reward_allocations: BundleRewardAllocation[];
  },
): Promise<ResolvedOrderBundle> {
  const voucher = await db.voucher.findUnique({
    where: { qr_token: input.qr_token },
    include: {
      package: {
        include: {
          promotion: {
            include: {
              bundleRule: { include: { productScopes: true, addonRewards: true } },
            },
          },
        },
      },
    },
  });
  assertVoucherUsable(voucher, input.user_id, input.now ?? new Date());
  const promotion = voucher.package.promotion;
  const ruleRecord = promotion.bundleRule;
  if (!ruleRecord || input.items.length !== input.resolved_items.length) {
    throw new BundlePromotionError("BUNDLE_INVALID_ORDER", "Bundle order lines are inconsistent");
  }

  const cartItems = input.resolved_items.map((item, index) => {
    const clientItem = input.items[index];
    if (!clientItem?.client_line_id) {
      throw new BundlePromotionError("BUNDLE_INVALID_ORDER", "Bundle line ID is missing");
    }
    return {
      client_line_id: clientItem.client_line_id,
      menu_item_id: item.menu_item_id,
      size: item.size,
      selected_powder_id: item.selected_powder_id,
      selected_milk_type_id: item.selected_milk_type_id,
      unit_price_vnd: item.unit_price_vnd,
      quantity: item.quantity,
      product_voucher_quantity: clientItem.product_voucher_id ? item.quantity : 0,
      addons: item.resolvedAddons.map((addon) => ({
        ...addon,
        voucher_discounted_quantity: clientItem.addon_voucher_ids.filter(
          (voucherLink) => voucherLink.addon_option_id === addon.addon_option_id,
        ).length,
      })),
    };
  });
  const evaluation = evaluateBundlePromotion({
    rule: toRule(ruleRecord),
    items: cartItems,
    reward_allocations: input.reward_allocations,
  });
  const lineDiscounts = cartItems.map((item) =>
    evaluation.rewards
      .filter((reward) => reward.client_line_id === item.client_line_id)
      .reduce((sum, reward) => sum + reward.discount_vnd, 0),
  );
  return {
    voucher_id: voucher.id,
    promotion_id: promotion.id,
    promotion_max_redemptions: promotion.max_redemptions,
    evaluation,
    line_discounts_vnd: lineDiscounts,
  };
}
