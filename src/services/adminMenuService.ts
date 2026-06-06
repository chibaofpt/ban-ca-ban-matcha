import { apiClient } from "@/src/lib/api/client";
import type { ApiResponse } from "@/src/lib/types/api";
import type { AdminMenuItem } from "@/src/lib/types/menu";

// ── URL map ──────────────────────────────────────────────────────────────────

const URL = {
  list: "/api/admin/menu",
  byId: (id: string) => `/api/admin/menu/${id}`,
  createLatteWithPowder: "/api/admin/menu/create-latte-with-powder",
} as const;

// ── Response shapes ───────────────────────────────────────────────────────────

/** Response shape for POST /api/admin/menu/create-latte-with-powder. */
export interface CreateLatteWithPowderResponse {
  menu_item: AdminMenuItem;
  powder_name: string;
}

// ── Response shape from GET /api/admin/menu ───────────────────────────────────

export interface AdminMenuData {
  updated_at: string;
  latte: AdminMenuItem[];
  fusion: AdminMenuItem[];
}

// ── Service functions ─────────────────────────────────────────────────────────

/** Fetch all menu items including unavailable ones — ADMIN only. */
export async function listAdminMenuItems(): Promise<AdminMenuData> {
  const res = await apiClient.get<ApiResponse<AdminMenuData>>(URL.list);
  return res.data.data;
}

/** Tạo menu item mới — POST /api/admin/menu (multipart/form-data). */
export async function createMenuItem(fd: FormData): Promise<AdminMenuItem> {
  try {
    const res = await apiClient.post<ApiResponse<AdminMenuItem>>(URL.list, fd);
    return res.data.data;
  } catch (error: any) {
    if (error.response?.data) {
      console.error("API Error Response Data (CREATE):", error.response.data);
    }
    throw error;
  }
}

/** Tạo Latte + bột mới inline — POST /api/admin/menu/create-latte-with-powder (multipart/form-data). */
export async function createLatteWithPowder(
  fd: FormData
): Promise<CreateLatteWithPowderResponse> {
  try {
    const res = await apiClient.post<ApiResponse<CreateLatteWithPowderResponse>>(
      URL.createLatteWithPowder,
      fd
    );
    return res.data.data;
  } catch (error: any) {
    if (error.response?.data) {
      console.error("API Error Response Data (CREATE_LATTE_WITH_POWDER):", error.response.data);
    }
    throw error;
  }
}

/** Cập nhật menu item — PUT /api/admin/menu/[id] (multipart/form-data). */
export async function updateMenuItem(id: string, fd: FormData): Promise<AdminMenuItem> {
  try {
    const res = await apiClient.put<ApiResponse<AdminMenuItem>>(URL.byId(id), fd);
    return res.data.data;
  } catch (error: any) {
    if (error.response?.data) {
      console.error("API Error Response Data:", error.response.data);
    }
    throw error;
  }
}

/** Toggle is_available — PUT /api/admin/menu/[id] (JSON, not FormData). */
export async function toggleMenuItemAvailability(
  id: string,
  is_available: boolean
): Promise<AdminMenuItem> {
  const res = await apiClient.put<ApiResponse<AdminMenuItem>>(URL.byId(id), { is_available });
  return res.data.data;
}

/** Soft-delete menu item — DELETE /api/admin/menu/[id]. */
export async function deleteMenuItem(
  id: string
): Promise<{ id: string; disabled_powder_id?: string }> {
  const res = await apiClient.delete<ApiResponse<{ id: string; disabled_powder_id?: string }>>(
    URL.byId(id)
  );
  return res.data.data;
}
