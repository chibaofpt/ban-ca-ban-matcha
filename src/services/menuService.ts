import { apiClient } from "@/src/lib/api/client";
import type { ApiResponse } from "@/src/lib/types/api";
import type { MenuData, MenuItem } from "@/src/lib/types/menu";

const URL = {
  menu: "/api/menu",
} as const;

/**
 * Fetches the full menu grouped by category from GET /api/menu.
 * Returns the raw grouped structure — use fetchMenuItems() for a flat list.
 */
export async function fetchMenu(): Promise<MenuData> {
  const res = await apiClient.get<ApiResponse<MenuData>>(URL.menu);
  return res.data.data;
}

/**
 * Fetches all available menu items as a flat array, flattened from the category-grouped API response.
 */
export async function fetchMenuItems(): Promise<MenuItem[]> {
  const data = await fetchMenu();
  return [...data.latte, ...data.fusion, ...(data.extras ?? [])];
}
