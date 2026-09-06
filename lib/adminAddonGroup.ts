import type { AdminAddonGroup } from "@/src/lib/types/addonGroup";

export const ADMIN_ADDON_OPTION_ORDER_BY = [
  { sort_order: "asc" as const },
  { id: "asc" as const },
];

export const ADMIN_ADDON_GROUP_ORDER_BY = [
  { sort_order: "asc" as const },
  { id: "asc" as const },
];

interface AddonOptionRecord {
  id: string;
  addon_group_id: string;
  label: string;
  image_url: string | null;
  price_vnd: number;
  is_active: boolean;
  sort_order: number;
  gram_value: unknown;
}

interface AddonGroupRecord {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  max_select: number;
  is_dynamic_gram: boolean;
  is_active: boolean;
  created_at: Date | string;
  options: AddonOptionRecord[];
}

/** Convert a Prisma add-on group record into the stable admin API DTO. */
export function mapAdminAddonGroup(group: AddonGroupRecord): AdminAddonGroup {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    image_url: group.image_url,
    sort_order: group.sort_order,
    max_select: group.max_select,
    is_dynamic_gram: group.is_dynamic_gram,
    is_active: group.is_active,
    created_at: new Date(group.created_at).toISOString(),
    options: group.options.map((option) => ({
      id: option.id,
      addon_group_id: option.addon_group_id,
      label: option.label,
      image_url: option.image_url,
      price_vnd: option.price_vnd,
      is_active: option.is_active,
      sort_order: option.sort_order,
      gram_value: option.gram_value === null ? null : Number(option.gram_value),
    })),
  };
}

/** Return a stable reason when an option does not match its group's pricing model. */
export function validateAddonOptionPricing(
  isDynamicGram: boolean,
  option: { price_vnd: number; gram_value?: number | null },
): string | null {
  if (isDynamicGram) {
    return option.price_vnd === 0 && option.gram_value != null && option.gram_value > 0
      ? null
      : "DYNAMIC_GRAM_OPTION_REQUIRES_GRAMS";
  }
  return option.gram_value == null ? null : "FIXED_PRICE_OPTION_CANNOT_HAVE_GRAMS";
}
