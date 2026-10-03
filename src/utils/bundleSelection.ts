import {
  bundleAvailableProductQuantity,
  bundleProductUnitUsage,
  bundlePersonalVoucherQuantity,
  type BundleCartItem,
  type BundlePromotionRule,
  type BundleQualifierAllocation,
  type BundleRewardAllocation,
} from "@/src/utils/bundlePromotion";
import { evaluateBundleApplications, type BundleApplicationEvaluationInput } from "@/src/utils/bundlePromotionApplications";
import {
  bundleSelectionSiblingUsage,
  normalizeBundleQualifiers,
  normalizeBundleRewards,
} from "@/src/utils/bundleSelectionAutofill";

export { autofillBundleSelection } from "@/src/utils/bundleSelectionAutofill";

export type BundleSelectionStatus = "INCOMPLETE" | "READY" | "CONFLICT" | "INELIGIBLE";

export interface BundleSelectionPlanInput {
  items: BundleCartItem[];
  voucher_qr_token: string;
  rule: BundlePromotionRule;
  qualifier_allocations?: BundleQualifierAllocation[];
  reward_allocations?: BundleRewardAllocation[];
  /** Applications already reserved by other BUNDLE tokens in the same cart. */
  sibling_applications?: BundleApplicationEvaluationInput[];
  selected_application_count?: number;
  selected_qualifier_quantity?: number;
  /** Paid merchandise subtotal before this BUNDLE evaluation and its discount. */
  paid_merchandise_subtotal_vnd?: number;
}

export interface BundleSelectionReason {
  code: string;
  message: string;
  voucher_qr_token?: string;
  client_line_id?: string;
}

export interface BundleSelectionPlan {
  status: BundleSelectionStatus;
  reason: BundleSelectionReason | null;
  qualifier_allocations: BundleQualifierAllocation[];
  reward_allocations: BundleRewardAllocation[];
  selected_application_count: number;
  progress: {
    required_qualifier_quantity: number;
    selected_qualifier_quantity: number;
    required_reward_quantity: number;
    selected_reward_quantity: number;
    missing_qualifier_quantity: number;
    missing_reward_quantity: number;
  };
  total_discount_vnd: number;
  remaining_payable_vnd: number | null;
}

export interface BundleSelectionApplication {
  voucher_qr_token: string;
  qualifier_allocations: BundleQualifierAllocation[];
  reward_allocations: BundleRewardAllocation[];
}

export interface BundleRequiredQuantities {
  applications: number;
  qualifiers: number;
  rewards: number;
  valid: boolean;
  reason?: string;
}

/** Resolve the evaluator's exact addon reward quantity for a qualifier pool. */
export function getBundleRequiredQuantities(rule: Pick<BundlePromotionRule, "benefit_scaling" | "buy_quantity" | "reward_quantity" | "max_applications_per_order" | "max_reward_units_per_order">, qualifierQuantity: number): BundleRequiredQuantities {
  const maxQualifiers = rule.buy_quantity * rule.max_applications_per_order;
  if (!Number.isInteger(qualifierQuantity) || qualifierQuantity < 1) {
    return { applications: 0, qualifiers: qualifierQuantity, rewards: 0, valid: false, reason: "Chưa đủ đơn vị món mua cho BUNDLE" };
  }
  if (rule.benefit_scaling === "ONCE_PER_ORDER") {
    const valid = qualifierQuantity === rule.buy_quantity;
    return { applications: 1, qualifiers: rule.buy_quantity, rewards: Math.min(rule.reward_quantity, rule.max_reward_units_per_order ?? rule.reward_quantity), valid, ...(valid ? {} : { reason: "BUNDLE dùng một lần cần đúng số món mua" }) };
  }
  if (qualifierQuantity < rule.buy_quantity || qualifierQuantity > maxQualifiers) {
    return { applications: 0, qualifiers: qualifierQuantity, rewards: 0, valid: false, reason: "Số món mua vượt giới hạn BUNDLE" };
  }
  if (rule.benefit_scaling === "PER_QUALIFYING_ITEM") {
    const rewards = qualifierQuantity * rule.reward_quantity;
    return { applications: qualifierQuantity, qualifiers: qualifierQuantity, rewards: Math.min(rewards, rule.max_reward_units_per_order ?? rewards), valid: true };
  }
  const valid = qualifierQuantity % rule.buy_quantity === 0;
  const applications = valid ? qualifierQuantity / rule.buy_quantity : 0;
  if (!valid || applications < 1 || applications > rule.max_applications_per_order) {
    return { applications, qualifiers: qualifierQuantity, rewards: 0, valid: false, reason: "Các nhóm món mua BUNDLE chưa đủ" };
  }
  const rewards = applications * rule.reward_quantity;
  const cappedRewards = Math.min(rewards, rule.max_reward_units_per_order ?? rewards);
  const validCap = rule.max_reward_units_per_order === null || cappedRewards % rule.reward_quantity === 0;
  return { applications, qualifiers: qualifierQuantity, rewards: cappedRewards, valid: validCap, ...(validCap ? {} : { reason: "Giới hạn phần thưởng BUNDLE làm nhóm không trọn vẹn" }) };
}

type Usage = ReturnType<typeof bundleSelectionSiblingUsage>;

function applicationCount(input: BundleSelectionPlanInput, rewardQuantity: number, qualifierQuantity: number): number {
  if (input.selected_application_count && Number.isInteger(input.selected_application_count)) return input.selected_application_count;
  if (input.rule.benefit_scaling === "ONCE_PER_ORDER") return 1;
  if (input.rule.benefit_scaling === "PER_QUALIFYING_ITEM") return Math.max(1, Math.ceil(qualifierQuantity / input.rule.buy_quantity));
  return rewardQuantity > 0 && rewardQuantity % input.rule.reward_quantity === 0
    ? rewardQuantity / input.rule.reward_quantity
    : 1;
}

function requiredQuantities(input: BundleSelectionPlanInput, qualifierQuantity: number, rewardQuantity: number): { applications: number; qualifiers: number; rewards: number } {
  const applications = applicationCount(input, rewardQuantity, qualifierQuantity);
  if (input.rule.benefit_scaling === "PER_QUALIFYING_ITEM") {
    const inferredFromRewards = rewardQuantity > 0 ? Math.ceil(rewardQuantity / input.rule.reward_quantity) : 0;
    const qualifying = Math.max(input.selected_qualifier_quantity ?? qualifierQuantity, inferredFromRewards, input.rule.buy_quantity);
    const required = getBundleRequiredQuantities(input.rule, Math.min(qualifying, input.rule.buy_quantity * input.rule.max_applications_per_order));
    return { applications, qualifiers: required.qualifiers, rewards: required.rewards };
  }
  const required = getBundleRequiredQuantities(input.rule, applications * input.rule.buy_quantity);
  return { applications, qualifiers: required.qualifiers, rewards: required.rewards };
}

function siblingUsage(applications: readonly BundleApplicationEvaluationInput[]): Usage {
  return bundleSelectionSiblingUsage(applications);
}

function reason(code: string, message: string, input: BundleSelectionPlanInput, client_line_id?: string, voucher_qr_token = input.voucher_qr_token): BundleSelectionReason {
  return { code, message, voucher_qr_token, ...(client_line_id ? { client_line_id } : {}) };
}

function errorDetails(error: unknown): { code: string; message: string } {
  if (error && typeof error === "object" && "reason" in error) {
    const details = error as { reason: unknown; message?: unknown };
    return {
      code: typeof details.reason === "string" ? details.reason : "BUNDLE_INVALID_SELECTION",
      message: typeof details.message === "string" ? details.message : "Không thể kiểm tra lựa chọn BUNDLE",
    };
  }
  return { code: "BUNDLE_INVALID_SELECTION", message: error instanceof Error ? error.message : "Không thể kiểm tra lựa chọn BUNDLE" };
}

function invalidSiblingReason(input: BundleSelectionPlanInput, siblings: readonly BundleApplicationEvaluationInput[]): BundleSelectionReason | null {
  const seen = new Set<string>();
  for (const sibling of siblings) {
    if (seen.has(sibling.voucher_qr_token)) return reason("BUNDLE_DUPLICATE_VOUCHER", "Mỗi voucher BUNDLE chỉ được dùng một lần", input, undefined, sibling.voucher_qr_token);
    seen.add(sibling.voucher_qr_token);
  }
  try {
    evaluateBundleApplications({ items: input.items, applications: [...siblings] });
  } catch {
    for (let index = 0; index < siblings.length; index += 1) {
      try {
        evaluateBundleApplications({ items: input.items, applications: siblings.slice(0, index + 1) });
      } catch (error) {
        const details = errorDetails(error);
        const sibling = siblings[index]!;
        return reason(details.code, details.message, input, undefined, sibling.voucher_qr_token);
      }
    }
  }
  return null;
}

/** Plan one explicit BUNDLE selection while reserving sibling capacity. */
export function planBundleSelection(input: BundleSelectionPlanInput): BundleSelectionPlan {
  const qualifiers = normalizeBundleQualifiers(input.qualifier_allocations ?? []);
  const rewards = normalizeBundleRewards(input.reward_allocations ?? []);
  const selectedQualifierQuantity = qualifiers.reduce((sum, allocation) => sum + allocation.quantity, 0);
  const selectedRewardQuantity = rewards.reduce((sum, allocation) => sum + allocation.quantity, 0);
  const required = requiredQuantities(input, selectedQualifierQuantity, selectedRewardQuantity);
  const siblings = input.sibling_applications ?? [];
  const siblingError = invalidSiblingReason(input, siblings);
  if (siblingError) return planResult("CONFLICT", siblingError, input, qualifiers, rewards, required, selectedQualifierQuantity, selectedRewardQuantity);
  const usage = siblingUsage(siblings);
  const itemByLine = new Map(input.items.map((item) => [item.client_line_id, item]));

  const currentProductUsage = bundleProductUnitUsage(input.rule, qualifiers, rewards);
  const productLineIds = new Set([...usage.product.keys(), ...currentProductUsage.keys()]);
  for (const lineId of productLineIds) {
    const item = itemByLine.get(lineId);
    const available = item ? bundleAvailableProductQuantity(item) : 0;
    if (!item) return planResult("CONFLICT", reason("BUNDLE_SCOPE_MISMATCH", "Không tìm thấy dòng giỏ tương ứng", input, lineId), input, qualifiers, rewards, required, selectedQualifierQuantity, selectedRewardQuantity);
    const siblingQuantity = usage.product.get(lineId) ?? 0;
    const currentQuantity = currentProductUsage.get(lineId) ?? 0;
    if (siblingQuantity + currentQuantity > available) {
      const hasPersonalVoucher = bundlePersonalVoucherQuantity(item) > 0;
      const currentAloneShortage = currentQuantity > available;
      const code = currentAloneShortage && hasPersonalVoucher ? "BUNDLE_CONFLICT" : "BUNDLE_ALLOCATION_OVERLAP";
      return planResult("CONFLICT", reason(code, code === "BUNDLE_CONFLICT" ? "Đơn vị đã dùng voucher cá nhân; hãy chọn đơn vị khác" : "Lựa chọn trùng với một BUNDLE khác; hãy đổi đơn vị", input, lineId), input, qualifiers, rewards, required, selectedQualifierQuantity, selectedRewardQuantity);
    }
  }
  const currentAddonUsage = new Map<string, number>();
  for (const allocation of rewards) if (allocation.addon_option_id) {
    const key = `${allocation.client_line_id}:${allocation.addon_option_id}`;
    currentAddonUsage.set(key, (currentAddonUsage.get(key) ?? 0) + allocation.quantity);
  }
  const addonKeys = new Set([...usage.addon.keys(), ...currentAddonUsage.keys()]);
  for (const key of addonKeys) {
    const splitAt = key.lastIndexOf(":");
    const lineId = key.slice(0, splitAt);
    const addonOptionId = key.slice(splitAt + 1);
    const item = itemByLine.get(lineId);
    const addon = item?.addons.find((candidate) => candidate.addon_option_id === addonOptionId);
    if (!addon) {
      return planResult("CONFLICT", reason("BUNDLE_SCOPE_MISMATCH", "Không tìm thấy addon tương ứng trong dòng giỏ", input, lineId), input, qualifiers, rewards, required, selectedQualifierQuantity, selectedRewardQuantity);
    }
    const personal = Math.max(0, addon.personal_voucher_quantity ?? addon.voucher_discounted_quantity ?? 0);
    const siblingQuantity = usage.addon.get(key) ?? 0;
    const currentQuantity = currentAddonUsage.get(key) ?? 0;
    const available = Math.max(0, addon.quantity - personal);
    if (siblingQuantity + currentQuantity > available) {
      const currentAloneShortage = currentQuantity > available;
      const code = currentAloneShortage && personal > 0 ? "BUNDLE_CONFLICT" : "BUNDLE_ALLOCATION_OVERLAP";
      return planResult("CONFLICT", reason(code, code === "BUNDLE_CONFLICT" ? "Addon đã có voucher cá nhân" : "Addon đã được voucher BUNDLE khác sử dụng", input, lineId), input, qualifiers, rewards, required, selectedQualifierQuantity, selectedRewardQuantity);
    }
  }

  const complete = selectedQualifierQuantity === required.qualifiers && selectedRewardQuantity === required.rewards;
  const progress = { required_qualifier_quantity: required.qualifiers, selected_qualifier_quantity: selectedQualifierQuantity, required_reward_quantity: required.rewards, selected_reward_quantity: selectedRewardQuantity, missing_qualifier_quantity: Math.max(0, required.qualifiers - selectedQualifierQuantity), missing_reward_quantity: Math.max(0, required.rewards - selectedRewardQuantity) };
  if (!complete) return planResult("INCOMPLETE", null, input, qualifiers, rewards, required, selectedQualifierQuantity, selectedRewardQuantity, progress);

  try {
    const evaluated = evaluateBundleApplications({ items: input.items, applications: [...siblings, { voucher_qr_token: input.voucher_qr_token, rule: input.rule, qualifier_allocations: qualifiers, reward_allocations: rewards }] });
    const own = evaluated.evaluations.find((entry) => entry.voucher_qr_token === input.voucher_qr_token)?.evaluation;
    if (!own || own.total_discount_vnd <= 0) return planResult("INELIGIBLE", reason("BUNDLE_NO_BENEFIT", "Lua chon khong tao ra quyen loi BUNDLE", input), input, qualifiers, rewards, required, selectedQualifierQuantity, selectedRewardQuantity, progress);
    return { ...planResult("READY", null, input, qualifiers, rewards, required, selectedQualifierQuantity, selectedRewardQuantity, progress), total_discount_vnd: own.total_discount_vnd, remaining_payable_vnd: input.paid_merchandise_subtotal_vnd === undefined ? null : Math.max(0, input.paid_merchandise_subtotal_vnd - own.total_discount_vnd) };
  } catch (error) {
    const details = errorDetails(error);
    return planResult(details.code === "BUNDLE_MIN_ORDER_NOT_MET" ? "INELIGIBLE" : "CONFLICT", reason(details.code, details.message, input), input, qualifiers, rewards, required, selectedQualifierQuantity, selectedRewardQuantity, progress);
  }
}

function planResult(status: BundleSelectionStatus, selectionReason: BundleSelectionReason | null, input: BundleSelectionPlanInput, qualifiers: BundleQualifierAllocation[], rewards: BundleRewardAllocation[], required: { applications: number; qualifiers: number; rewards: number }, selectedQualifierQuantity: number, selectedRewardQuantity: number, progress = { required_qualifier_quantity: required.qualifiers, selected_qualifier_quantity: selectedQualifierQuantity, required_reward_quantity: required.rewards, selected_reward_quantity: selectedRewardQuantity, missing_qualifier_quantity: Math.max(0, required.qualifiers - selectedQualifierQuantity), missing_reward_quantity: Math.max(0, required.rewards - selectedRewardQuantity) }): BundleSelectionPlan {
  return { status, reason: selectionReason, qualifier_allocations: qualifiers, reward_allocations: rewards, selected_application_count: required.applications, progress, total_discount_vnd: 0, remaining_payable_vnd: null };
}
