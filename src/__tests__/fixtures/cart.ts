import type { CartAddonVoucher, CartLineConfiguration, ProjectedCartLine } from "@/src/lib/types/cart";
import type { Category, Size, SweetnessLevel } from "@/src/lib/types/menu";

interface LegacyAddonVoucher {
  token?: string;
  voucherId?: string;
  addonOptionId: string;
  discountAmount?: number;
  discountVnd?: number;
}

export interface LegacyCartFields {
  name: string;
  imageUrl: string | null;
  category: Category;
  size: Size | null;
  sweetness: SweetnessLevel;
  iceOption: "NORMAL" | "LESS_ICE" | "NO_ICE" | "SEPARATE_ICE";
  coldwhisk: boolean;
  note: string;
  selectedOptionIds: string[];
  selectedPowderId?: string;
  selectedBaseLiquidId?: string;
  selectedMilkTypeId?: string;
  unitPrice: number;
  addonsPrice: number;
  addonPrices: Record<string, number>;
  addonMetadata: Record<string, { groupId?: string; groupName?: string; maxSelect?: number; addon_group_id?: string; max_select?: number; gram_value?: number | null; is_dynamic_gram?: boolean; is_active?: boolean; is_deleted?: boolean }>;
  clientPriceVnd: number;
  originalClientPriceVnd: number;
  productVoucherId?: string;
  productVoucherDiscountVnd?: number;
  productVoucherType?: "PRODUCT" | "PRODUCT_DISCOUNT";
  itemVoucherId?: string;
  bundleQualifierVoucherToken?: string;
  bundleRewardVoucherToken?: string;
  sourceCartId?: string;
  sourceUnitIndex?: number;
}

export type CompatProjectedCartLine = Omit<ProjectedCartLine, "addonVouchers"> & LegacyCartFields & {
  addonVouchers: Array<CartAddonVoucher & { voucherId: string; discountAmount?: number }>;
};

type CompatLineInput = Partial<Omit<ProjectedCartLine, "addonVouchers"> & LegacyCartFields> & {
  cartId?: string;
  menuItemId?: string;
  addonVouchers?: LegacyAddonVoucher[];
};

/** Build a current projection while retaining legacy fields only for characterization assertions. */
export function projectedCartLine(input: CompatLineInput = {}): CompatProjectedCartLine {
  const category = input.category ?? "latte";
  const size = input.size === undefined ? input.configuration?.size ?? "MEDIUM" : input.size;
  const selectedOptionIds = input.selectedOptionIds ?? (input.configuration?.size === null ? [] : input.configuration?.addonOptionIds ?? []);
  const addonsPrice = input.addonsPrice ?? 0;
  const originalClientPriceVnd = input.originalClientPriceVnd ?? input.unitPrice ?? 45_000;
  const clientPriceVnd = input.clientPriceVnd ?? originalClientPriceVnd;
  const configuration: CartLineConfiguration = size === null || category === "extras"
    ? { size: null, note: input.note ?? "" }
    : {
        size,
        sweetness: input.sweetness ?? (input.configuration?.size === null ? "FULL" : input.configuration?.sweetness) ?? "FULL",
        iceOption: input.iceOption ?? (input.configuration?.size === null ? "NORMAL" : input.configuration?.iceOption) ?? "NORMAL",
        coldwhisk: input.coldwhisk ?? (input.configuration?.size === null ? false : input.configuration?.coldwhisk) ?? false,
        note: input.note ?? input.configuration?.note ?? "",
        ...(input.selectedPowderId ?? (input.configuration?.size === null ? undefined : input.configuration?.powderId)
          ? { powderId: input.selectedPowderId ?? (input.configuration?.size === null ? undefined : input.configuration?.powderId) }
          : {}),
        ...(input.selectedBaseLiquidId ?? input.selectedMilkTypeId ?? (input.configuration?.size === null ? undefined : input.configuration?.baseLiquidId)
          ? { baseLiquidId: input.selectedBaseLiquidId ?? input.selectedMilkTypeId ?? (input.configuration?.size === null ? undefined : input.configuration?.baseLiquidId) }
          : {}),
        addonOptionIds: selectedOptionIds,
      };
  const rawAddonVouchers = input.addonVouchers ?? [];
  const addonVouchers = rawAddonVouchers.flatMap((voucher) => {
    const token = voucher.token ?? voucher.voucherId;
    const discountAmount = voucher.discountAmount ?? voucher.discountVnd;
    return token ? [{ token, voucherId: token, addonOptionId: voucher.addonOptionId, ...(discountAmount === undefined ? {} : { discountAmount }) }] : [];
  });
  const lineVoucher = input.lineVoucher ?? (input.itemVoucherId
    ? { token: input.itemVoucherId, kind: "ITEM" as const }
    : input.productVoucherId ? { token: input.productVoucherId, kind: input.productVoucherType ?? "PRODUCT" } : undefined);
  const addonPrices = input.addonPrices ?? {};
  const addonMetadata = input.addonMetadata ?? {};
  const resolvedAddons = input.resolvedAddons ?? selectedOptionIds.map((id) => ({
    id,
    label: id,
    priceVnd: addonPrices[id] ?? 0,
    groupId: addonMetadata[id]?.groupId ?? addonMetadata[id]?.addon_group_id ?? "group-1",
    groupName: addonMetadata[id]?.groupName ?? "Topping",
    maxSelect: addonMetadata[id]?.maxSelect ?? addonMetadata[id]?.max_select ?? 1,
    isExtraMatcha: addonMetadata[id]?.gram_value != null || addonMetadata[id]?.is_dynamic_gram === true,
  }));
  const drinkPriceVnd = input.drinkPriceVnd ?? Math.max(0, originalClientPriceVnd - addonsPrice);
  const grossUnitPriceVnd = input.grossUnitPriceVnd ?? originalClientPriceVnd;
  const personalVoucherDiscountVnd = input.personalVoucherDiscountVnd ?? Math.max(0, grossUnitPriceVnd - clientPriceVnd);
  return {
    cartId: input.cartId ?? "line-1",
    menuItemId: input.menuItemId ?? "latte-1",
    quantity: input.quantity ?? 1,
    configuration,
    ...(lineVoucher ? { lineVoucher } : {}),
    addonVouchers,
    name: input.name ?? "Latte",
    imageUrl: input.imageUrl ?? null,
    category,
    resolvedAddons,
    drinkPriceVnd,
    addonsPriceVnd: input.addonsPriceVnd ?? addonsPrice,
    grossUnitPriceVnd,
    personalVoucherDiscountVnd,
    bundleDiscountVnd: input.bundleDiscountVnd ?? 0,
    payableUnitVnd: input.payableUnitVnd ?? clientPriceVnd,
    lineTotalVnd: input.lineTotalVnd ?? clientPriceVnd * (input.quantity ?? 1),
    errors: input.errors ?? [],
    revalidating: input.revalidating ?? false,
    size,
    sweetness: input.sweetness ?? "FULL",
    iceOption: input.iceOption ?? "NORMAL",
    coldwhisk: input.coldwhisk ?? false,
    note: input.note ?? "",
    selectedOptionIds,
    unitPrice: input.unitPrice ?? originalClientPriceVnd,
    addonsPrice,
    addonPrices,
    addonMetadata,
    clientPriceVnd,
    originalClientPriceVnd,
    ...(input.selectedPowderId ? { selectedPowderId: input.selectedPowderId } : {}),
    ...(input.selectedBaseLiquidId ? { selectedBaseLiquidId: input.selectedBaseLiquidId } : {}),
    ...(input.selectedMilkTypeId ? { selectedMilkTypeId: input.selectedMilkTypeId } : {}),
    ...(input.productVoucherId ? { productVoucherId: input.productVoucherId } : {}),
    ...(input.productVoucherDiscountVnd === undefined ? {} : { productVoucherDiscountVnd: input.productVoucherDiscountVnd }),
    ...(input.productVoucherType ? { productVoucherType: input.productVoucherType } : {}),
    ...(input.itemVoucherId ? { itemVoucherId: input.itemVoucherId } : {}),
    ...(input.bundleQualifierVoucherToken ? { bundleQualifierVoucherToken: input.bundleQualifierVoucherToken } : {}),
    ...(input.bundleRewardVoucherToken ? { bundleRewardVoucherToken: input.bundleRewardVoucherToken } : {}),
    ...(input.sourceCartId ? { sourceCartId: input.sourceCartId } : {}),
    ...(input.sourceUnitIndex === undefined ? {} : { sourceUnitIndex: input.sourceUnitIndex }),
  };
}
