export interface AdminAddonOption {
  id: string;
  addon_group_id: string;
  label: string;
  image_url: string | null;
  price_vnd: number;
  is_active: boolean;
  sort_order: number;
  gram_value: number | null;
}

export interface AdminAddonGroup {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  max_select: number;
  is_dynamic_gram: boolean;
  is_active: boolean;
  created_at: string;
  options: AdminAddonOption[];
}

/** Editable addon group fields sent by the admin UI. */
export interface AddonGroupMutationPayload {
  name: string;
  description?: string | null;
  max_select: number;
  is_dynamic_gram: boolean;
  is_active: boolean;
  options: Array<{
    id?: string;
    image_key?: string;
    label: string;
    price_vnd: number;
    is_active: boolean;
    sort_order: number;
    gram_value?: number | null;
  }>;
}

/** Cropped image data correlated to one option in an addon-group mutation. */
export interface AddonOptionImageUpload {
  imageKey: string;
  imageFile: File | null;
  imageFilename: string;
}
