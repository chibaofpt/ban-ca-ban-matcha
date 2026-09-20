import type { PowderSizeConfigEntry, PowderType } from "@/contracts/catalog";
import type {
  Category,
  MenuItemPowder,
  MilkTypeOption,
  Size,
} from "@/contracts/menu";

/** Admin menu item returned by catalog management endpoints. */
export interface AdminMenuItem {
  id: string;
  name: string;
  description: string | null;
  category: Category;
  unit_price_vnd?: number | null;
  is_seasonal: boolean;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
  base_liquid_note: string | null;
  custom_powder_grams: { M?: number; L?: number; XL?: number } | null;
  updated_at: string;
  matcha_powder_id: string | null;
  powder: MenuItemPowder | null;
  default_powder_id: string | null;
  default_powder: MenuItemPowder | null;
  allowed_powder_ids: string[];
  default_base_liquid_id?: string | null;
  allowed_base_liquid_ids?: string[];
  sizes: Array<{
    size: Size;
    base_price_vnd: number | null;
    milk_ml: number;
    base_liquid_ml?: number;
    base_liquid_ml_override?: number | null;
    uses_system_base_liquid_ml?: boolean;
  }>;
}

export interface MenuOrderSnapshotItem {
  id: string;
  category: Category;
  sort_order: number;
  is_available: boolean;
}

export interface MenuOrderGroups {
  latte: string[];
  fusion: string[];
  extras: string[];
}

export interface MenuReorderPayload {
  groups: MenuOrderGroups;
  baseline: MenuOrderSnapshotItem[];
}

export interface MenuReorderResult {
  groups: MenuOrderGroups;
  updated_at: string;
}

export interface CreateLatteWithPowderResponse {
  menu_item: AdminMenuItem;
  powder_name: string;
}

export interface AdminMenuData {
  updated_at: string;
  latte: AdminMenuItem[];
  fusion: AdminMenuItem[];
  extras?: AdminMenuItem[];
  base_liquids?: MilkTypeOption[];
  default_size_config?: Array<{ size: Size; base_liquid_ml: number }>;
}

/** Editable powder fields sent by the admin UI. */
export interface PowderMutationPayload {
  name: string;
  manufacturer: string;
  description?: string | null;
  price_per_gram: number;
  type: PowderType;
  reference_latte_item_id?: string | null;
  fragrance?: number | null;
  body?: number | null;
  bitterness?: number | null;
  umami?: number | null;
  color?: number | null;
  is_available: boolean;
  size_config?: PowderSizeConfigEntry[];
}

/** Admin view of a Base Liquid. */
export interface AdminMilkType {
  id: string;
  name: string;
  price_per_ml: number;
  is_default: boolean;
  is_active: boolean;
  image_url: string | null;
  display_order: number;
  created_at: string;
}

export interface CreateMilkTypeInput {
  name: string;
  price_per_ml: number;
  is_default: boolean;
  is_active: boolean;
  image_url?: string | null;
  image_filename?: string;
}

export interface UpdateMilkTypeInput {
  name?: string;
  price_per_ml?: number;
  is_default?: boolean;
  is_active?: boolean;
  image_url?: string | null;
  image_filename?: string;
  remove_image?: boolean;
  available_menu_item_ids?: string[];
}

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
  sort_order: number;
  max_select: number;
  is_dynamic_gram: boolean;
  is_active: boolean;
  created_at: string;
  options: AdminAddonOption[];
}

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

export interface AddonGroupDetailsMutationPayload {
  name: string;
  description?: string | null;
  max_select: number;
}

export interface AddonOptionDetailsMutationPayload {
  label: string;
  price_vnd: number;
  gram_value?: number | null;
}

export interface AddonOptionCreatePayload extends AddonOptionDetailsMutationPayload {
  is_active: boolean;
}

export interface AddonGroupReorderEntry {
  id: string;
  option_ids: string[];
}
