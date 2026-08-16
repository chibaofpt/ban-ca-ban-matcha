export interface AdminAddonOption {
  id: string;
  addon_group_id: string;
  label: string;
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
  type: "SELECTOR" | "TOGGLE" | "QUANTITY";
  max_quantity: number | null;
  is_active: boolean;
  created_at: string;
  options: AdminAddonOption[];
}

/** Editable addon group fields sent by the admin UI. */
export interface AddonGroupMutationPayload {
  name: string;
  description?: string | null;
  type: AdminAddonGroup["type"];
  max_quantity?: number | null;
  is_active: boolean;
  options: Array<{
    id?: string;
    label: string;
    price_vnd: number;
    is_active: boolean;
    sort_order: number;
    gram_value?: number | null;
  }>;
}
