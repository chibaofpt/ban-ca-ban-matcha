export interface AdminAddonOption {
  id: string;
  addon_group_id: string;
  label: string;
  price_vnd: number;
  is_default: boolean;
  sort_order: number;
  gram_value: number | null;
}

export interface AdminAddonGroup {
  id: string;
  name: string;
  description: string | null;
  type: "SELECTOR" | "TOGGLE" | "QUANTITY";
  is_required: boolean;
  min_quantity: number | null;
  max_quantity: number | null;
  is_active: boolean;
  created_at: string;
  options: AdminAddonOption[];
}
