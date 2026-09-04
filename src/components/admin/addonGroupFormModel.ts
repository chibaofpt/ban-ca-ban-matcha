import type { AdminAddonGroup } from "@/src/lib/types/addonGroup";

export interface AddonGroupFormOption {
  id?: string;
  image_key: string;
  image_url: string | null;
  image_file: File | null;
  image_filename: string;
  label: string;
  price_vnd: string;
  is_active: boolean;
  sort_order: string;
  gram_value: string;
}

export interface AddonGroupFormFields {
  name: string;
  description: string;
  max_select: string;
  is_dynamic_gram: boolean;
  is_active: boolean;
  options: AddonGroupFormOption[];
}

export interface AddonGroupFormPayload {
  name: string;
  description: string | null;
  max_select: number;
  is_dynamic_gram: boolean;
  is_active: boolean;
  options: Array<{
    id?: string;
    image_key: string;
    label: string;
    price_vnd: number;
    is_active: boolean;
    sort_order: number;
    gram_value: number | null;
  }>;
}

export interface AddonGroupFormSubmission {
  payload: AddonGroupFormPayload;
  optionImages: Array<{
    imageKey: string;
    imageFile: File | null;
    imageFilename: string;
  }>;
}

/** Convert an admin addon group DTO into editable form values. */
export function buildAddonGroupDefaultValues(item: AdminAddonGroup): Partial<AddonGroupFormFields> {
  return {
    name: item.name,
    description: item.description ?? "",
    max_select: String(item.max_select),
    is_dynamic_gram: item.is_dynamic_gram,
    is_active: item.is_active,
    options: item.options.map((option) => ({
      id: option.id,
      image_key: option.id,
      image_url: option.image_url,
      image_file: null,
      image_filename: "",
      label: option.label,
      price_vnd: String(option.price_vnd),
      is_active: option.is_active,
      sort_order: String(option.sort_order),
      gram_value: option.gram_value !== null ? String(option.gram_value) : "",
    })),
  };
}
