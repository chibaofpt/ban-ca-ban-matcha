import { z } from "zod";

const sizeSchema = z.enum(["SMALL", "MEDIUM", "LARGE"]);
const scopeSchema = z.object({
  menuItemId: z.string().min(1),
  category: z.enum(["latte", "fusion", "extras"]),
  sizes: z.array(sizeSchema).max(3),
  powderIds: z.array(z.string()),
  milkTypeIds: z.array(z.string()),
  fixedPowderId: z.string().nullable(),
});

const positiveInt = z.number().int().min(1);
const boundedInt = z.number().int().min(1).max(100);
const nullablePositiveInt = positiveInt.nullable();
const nullableMinimumOrder = z.number().int().min(1_000).nullable();

export type AdminVoucherType = "ITEM" | "DISCOUNT" | "PRODUCT" | "PRODUCT_DISCOUNT" | "ADDON" | "FREESHIP" | "BUNDLE";

const STEP2_FIELDS: Record<AdminVoucherType, readonly string[]> = {
  ITEM: ["name", "menuItemId"],
  DISCOUNT: ["name", "discountType", "discountValue", "maxDiscountVnd", "minOrderVnd"],
  PRODUCT: ["name", "menuItemId", "size", "matchaPowderId", "milkTypeId"],
  PRODUCT_DISCOUNT: ["name", "menuItemId", "eligibleMenuItemIds", "productDiscountMode", "eligibleSizes", "discountValue", "referenceSize"],
  ADDON: ["name", "addonOptionId"],
  FREESHIP: ["name", "coveredDeliveryFeeVnd", "minOrderVnd"],
  BUNDLE: ["name", "buyQuantity", "rewardQuantity", "rewardKind", "rewardMode", "benefitScaling", "maxApplications", "minOrderVnd", "qualifierScopes", "rewardProductScopes", "rewardAddonOptionIds"],
};

/** Returns the RHF owned fields that must pass before leaving wizard Step 2. */
export function getAdminVoucherStep2FieldPaths(voucherType: AdminVoucherType): readonly string[] {
  return STEP2_FIELDS[voucherType];
}

/** Validates the editable client draft before a wizard step or submit. */
export const adminVoucherDraftSchema = z.object({
  voucherType: z.enum(["ITEM", "DISCOUNT", "PRODUCT", "PRODUCT_DISCOUNT", "ADDON", "FREESHIP", "BUNDLE"]),
  name: z.string().trim().min(1, "Vui lòng nhập tên voucher").max(200),
  description: z.string().max(500),
  endsAt: z.string(),
  acquisitionMode: z.enum(["POINTS_EXCHANGE", "FREE_CLAIM", "AUTO_GRANT"]),
  pointsCost: z.number().int().min(0),
  expiresAfterDays: nullablePositiveInt,
  quantity: nullablePositiveInt,
  maxPerUser: boundedInt,
  minOrderVnd: nullableMinimumOrder,
  buyQuantity: boundedInt,
  rewardQuantity: boundedInt,
  rewardKind: z.enum(["PRODUCT", "ADDON"]),
  rewardMode: z.enum(["SAME_CONFIG", "FIXED_CONFIG", "ALLOWED_SCOPE"]),
  benefitScaling: z.enum(["PER_BUNDLE", "ONCE_PER_ORDER", "PER_QUALIFYING_ITEM"]),
  maxApplications: boundedInt,
  qualifierScopes: z.array(scopeSchema),
  rewardProductScopes: z.array(scopeSchema),
  rewardAddonOptionIds: z.array(z.string()),
  discountType: z.enum(["PERCENT", "FIXED"]),
  discountValue: z.number().int().min(1),
  productDiscountMode: z.enum(["FIXED_AMOUNT", "PAY_AS_SIZE"]),
  eligibleSizes: z.array(sizeSchema).max(3),
  referenceSize: sizeSchema,
  menuItemId: z.string(),
  eligibleMenuItemIds: z.array(z.string()).optional(),
  size: sizeSchema,
  matchaPowderId: z.string(),
  milkTypeId: z.string(),
  addonOptionId: z.string(),
  coveredDeliveryFeeVnd: z.number().int().min(1_000),
  maxDiscountVnd: z.number().int().min(1_000).nullable(),
}).superRefine((draft, ctx) => {
  const usesPoints = draft.acquisitionMode === "POINTS_EXCHANGE";
  if ((usesPoints && draft.pointsCost < 1) || (!usesPoints && draft.pointsCost !== 0)) {
    ctx.addIssue({ code: "custom", path: ["pointsCost"], message: usesPoints ? "Điểm đổi phải lớn hơn 0" : "Miễn phí hoặc tự cấp không dùng điểm" });
  }
  if (!usesPoints && draft.maxPerUser !== 1) {
    ctx.addIssue({ code: "custom", path: ["maxPerUser"], message: "Miễn phí hoặc tự cấp chỉ nhận một voucher mỗi khách" });
  }
  if (draft.voucherType === "DISCOUNT") {
    if (draft.discountType === "PERCENT" && draft.discountValue > 100) {
      ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Phần trăm giảm không được vượt quá 100" });
    }
    if (draft.discountType === "FIXED" && draft.discountValue % 1_000 !== 0) {
      ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Mức giảm cố định phải chia hết cho 1.000đ" });
    }
    if (draft.discountType === "FIXED" && draft.maxDiscountVnd !== null) {
      ctx.addIssue({ code: "custom", path: ["maxDiscountVnd"], message: "Giảm cố định không dùng mức giảm tối đa" });
    }
  }
  if (draft.voucherType === "DISCOUNT" && draft.discountType === "PERCENT" && draft.maxDiscountVnd !== null && draft.maxDiscountVnd % 1_000 !== 0) {
    ctx.addIssue({ code: "custom", path: ["maxDiscountVnd"], message: "Mức giảm tối đa phải chia hết cho 1.000đ" });
  }
  if (draft.voucherType === "PRODUCT" && !draft.menuItemId) {
    ctx.addIssue({ code: "custom", path: ["menuItemId"], message: "Vui lòng chọn sản phẩm" });
  }
  if (draft.voucherType === "PRODUCT_DISCOUNT") {
    const eligibleMenuItemIds = draft.eligibleMenuItemIds ?? [];
    if (eligibleMenuItemIds.length === 0 && !draft.menuItemId) ctx.addIssue({ code: "custom", path: ["eligibleMenuItemIds"], message: "Vui lòng chọn ít nhất một sản phẩm" });
    if (eligibleMenuItemIds.length > 100) ctx.addIssue({ code: "custom", path: ["eligibleMenuItemIds"], message: "Chỉ được chọn tối đa 100 sản phẩm" });
    if (draft.eligibleSizes.length === 0) ctx.addIssue({ code: "custom", path: ["eligibleSizes"], message: "Vui lòng chọn ít nhất một size" });
    if (draft.productDiscountMode === "FIXED_AMOUNT" && (draft.discountValue <= 0 || draft.discountValue % 1_000 !== 0)) ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Mức giảm phải chia hết cho 1.000đ" });
    if (draft.productDiscountMode === "PAY_AS_SIZE") {
      const rank = { SMALL: 0, MEDIUM: 1, LARGE: 2 } as const;
      if (draft.eligibleSizes.some((size) => rank[size] <= rank[draft.referenceSize])) ctx.addIssue({ code: "custom", path: ["referenceSize"], message: "Size tham chiếu phải nhỏ hơn mọi size áp dụng" });
    }
  }
  if (draft.voucherType === "ITEM" && !draft.menuItemId) ctx.addIssue({ code: "custom", path: ["menuItemId"], message: "Vui lòng chọn món lẻ" });
  if (draft.voucherType === "ADDON" && !draft.addonOptionId) ctx.addIssue({ code: "custom", path: ["addonOptionId"], message: "Vui lòng chọn addon" });
  if (draft.voucherType !== "BUNDLE") return;
  if (draft.qualifierScopes.length === 0) {
    ctx.addIssue({ code: "custom", path: ["qualifierScopes"], message: "Vui lòng chọn món mua đủ điều kiện" });
  }
  const validateScope = (scope: z.infer<typeof scopeSchema>, path: Array<string | number>): void => {
    if (scope.category === "extras") {
      if (scope.sizes.length > 0 || scope.powderIds.length > 0 || scope.milkTypeIds.length > 0 || scope.fixedPowderId !== null) {
        ctx.addIssue({ code: "custom", path, message: "Món lẻ không có cấu hình đồ uống" });
      }
      return;
    }
    if (scope.sizes.length === 0) ctx.addIssue({ code: "custom", path: [...path, "sizes"], message: "Hãy chọn ít nhất một size" });
    if (scope.milkTypeIds.length !== 1) ctx.addIssue({ code: "custom", path: [...path, "milkTypeIds"], message: "Hãy chọn đúng một Base Liquid mặc định" });
    if (scope.category === "fusion" && scope.powderIds.length !== 1) ctx.addIssue({ code: "custom", path: [...path, "powderIds"], message: "Hãy chọn đúng một bột mặc định cho Fusion" });
    if (scope.category === "latte" && !scope.fixedPowderId) ctx.addIssue({ code: "custom", path: [...path, "fixedPowderId"], message: "Latte chưa có bột cố định hợp lệ" });
  };
  draft.qualifierScopes.forEach((scope, index) => validateScope(scope, ["qualifierScopes", index]));
  if (draft.rewardKind === "PRODUCT") {
    if (draft.benefitScaling !== "PER_BUNDLE") ctx.addIssue({ code: "custom", path: ["benefitScaling"], message: "Quà sản phẩm tính theo mỗi nhóm mua" });
    if (draft.rewardMode === "SAME_CONFIG") {
      if (draft.rewardProductScopes.length > 0) ctx.addIssue({ code: "custom", path: ["rewardProductScopes"], message: "Tặng cùng món mua không cần nhóm quà riêng" });
    } else {
      if (draft.rewardProductScopes.length === 0) ctx.addIssue({ code: "custom", path: ["rewardProductScopes"], message: "Vui lòng chọn món quà" });
      if (draft.rewardMode === "FIXED_CONFIG" && draft.rewardProductScopes.length !== 1) ctx.addIssue({ code: "custom", path: ["rewardProductScopes"], message: "Quà cố định cần đúng một món" });
      draft.rewardProductScopes.forEach((scope, index) => validateScope(scope, ["rewardProductScopes", index]));
    }
    if (draft.rewardAddonOptionIds.length > 0) ctx.addIssue({ code: "custom", path: ["rewardAddonOptionIds"], message: "Quà sản phẩm không có addon" });
  } else {
    if (draft.rewardMode !== "ALLOWED_SCOPE") ctx.addIssue({ code: "custom", path: ["rewardMode"], message: "Quà addon dùng phạm vi addon" });
    if (draft.rewardProductScopes.length > 0) ctx.addIssue({ code: "custom", path: ["rewardProductScopes"], message: "Quà addon không có sản phẩm" });
    if (draft.rewardAddonOptionIds.length === 0) ctx.addIssue({ code: "custom", path: ["rewardAddonOptionIds"], message: "Vui lòng chọn addon quà" });
  }
});

export type AdminVoucherDraftValidation = z.infer<typeof adminVoucherDraftSchema>;
