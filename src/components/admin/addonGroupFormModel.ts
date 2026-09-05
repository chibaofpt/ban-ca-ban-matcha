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

/** Convert editable form values into the canonical admin add-on mutation contract. */
export function buildAddonGroupSubmission(values: AddonGroupFormFields): AddonGroupFormSubmission {
  const isDynamicGram = values.is_dynamic_gram;

  return {
    payload: {
      name: values.name.trim(),
      description: values.description.trim() || null,
      max_select: isDynamicGram ? 1 : Number(values.max_select) || 1,
      is_dynamic_gram: isDynamicGram,
      is_active: values.is_active,
      options: values.options.map((option, index) => ({
        id: option.id,
        image_key: option.image_key,
        label: option.label.trim(),
        price_vnd: isDynamicGram ? 0 : Number(option.price_vnd),
        is_active: option.is_active,
        sort_order: option.sort_order !== "" ? Number(option.sort_order) : index,
        gram_value: isDynamicGram && option.gram_value !== ""
          ? Number(option.gram_value)
          : null,
      })),
    },
    optionImages: values.options.map((option) => ({
      imageKey: option.image_key,
      imageFile: option.image_file,
      imageFilename: option.image_filename,
    })),
  };
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
