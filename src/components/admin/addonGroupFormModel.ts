import type { AdminAddonGroup } from "@/src/lib/types/addonGroup";

export interface AddonGroupFormOption {
  id?: string;
  label: string;
  price_vnd: string;
  is_default: boolean;
  sort_order: string;
  gram_value: string;
}

export interface AddonGroupFormFields {
  name: string;
  description: string;
  type: "SELECTOR" | "TOGGLE" | "QUANTITY";
  is_required: boolean;
  min_quantity: string;
  max_quantity: string;
  is_active: boolean;
  options: AddonGroupFormOption[];
}

export interface AddonGroupFormPayload {
  name: string;
  description: string | null;
  type: AddonGroupFormFields["type"];
  is_required: boolean;
  min_quantity: number | null;
  max_quantity: number | null;
  is_active: boolean;
  options: Array<{
    id?: string;
    label: string;
    price_vnd: number;
    is_default: boolean;
    sort_order: number;
    gram_value: number | null;
  }>;
}

/** Convert an admin addon group DTO into editable form values. */
export function buildAddonGroupDefaultValues(item: AdminAddonGroup): Partial<AddonGroupFormFields> {
  return {
    name: item.name,
    description: item.description ?? "",
    type: item.type,
    is_required: item.is_required,
    min_quantity: item.min_quantity !== null ? String(item.min_quantity) : "",
    max_quantity: item.max_quantity !== null ? String(item.max_quantity) : "",
    is_active: item.is_active,
    options: item.options.map((option) => ({
      id: option.id,
      label: option.label,
      price_vnd: String(option.price_vnd),
      is_default: option.is_default,
      sort_order: String(option.sort_order),
      gram_value: option.gram_value !== null ? String(option.gram_value) : "",
    })),
  };
}
