import { apiClient } from "@/src/lib/api/client";
import type { ApiResponse } from "@/src/lib/types/api";

export interface CreateBundlePromotionInput {
  title: string;
  description?: string;
  starts_at: string;
  ends_at: string;
  max_redemptions: number | null;
  package: {
    name: string;
    acquisition_mode: "POINTS_EXCHANGE" | "FREE_CLAIM" | "AUTO_GRANT";
    points_cost: number;
    expires_after_days?: number | null;
    quantity?: number | null;
    max_per_user: number;
  };
  bundle_rule: {
    buy_quantity: number;
    reward_quantity: number;
    reward_kind: "PRODUCT" | "ADDON";
    reward_mode: "SAME_CONFIG" | "FIXED_CONFIG" | "ALLOWED_SCOPE";
    benefit_scaling: "PER_BUNDLE" | "ONCE_PER_ORDER" | "PER_QUALIFYING_ITEM";
    max_applications_per_order: number;
    max_reward_units_per_order: number | null;
    qualifier_scopes: Array<{
      menu_item_id: string;
      size?: "SMALL" | "MEDIUM" | "LARGE" | null;
      powder_id?: string | null;
      milk_type_id?: string | null;
      reference_price_vnd?: number;
    }>;
    reward_product_scopes: Array<{
      menu_item_id: string;
      size?: "SMALL" | "MEDIUM" | "LARGE" | null;
      powder_id?: string | null;
      milk_type_id?: string | null;
      reference_price_vnd?: number;
    }>;
    reward_addon_option_ids: string[];
  };
}

export interface PromotionListItem {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  published_at: string | null;
}

/** List published BUNDLE promotions for admin management. */
export async function listPromotions(): Promise<PromotionListItem[]> {
  const response = await apiClient.get<ApiResponse<PromotionListItem[]>>("/api/admin/promotions");
  return response.data.data;
}

/** Publish one immutable BUNDLE promotion. */
export async function createPromotion(
  input: CreateBundlePromotionInput,
): Promise<PromotionListItem> {
  const response = await apiClient.post<ApiResponse<PromotionListItem>>(
    "/api/admin/promotions",
    input,
  );
  return response.data.data;
}

/** Activate or deactivate a promotion without changing its published rule. */
export async function setPromotionActive(
  id: string,
  isActive: boolean,
): Promise<PromotionListItem> {
  const response = await apiClient.patch<ApiResponse<PromotionListItem>>(
    `/api/admin/promotions/${id}`,
    { is_active: isActive },
  );
  return response.data.data;
}
