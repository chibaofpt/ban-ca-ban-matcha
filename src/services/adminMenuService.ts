import { apiClient } from "@/src/lib/api/client";
import axios from "axios";
import type {
  AdminMenuData,
  AdminMenuItem,
  CreateLatteWithPowderResponse,
  MenuReorderPayload,
  MenuReorderResult,
} from "@/contracts/admin/catalog";
import type { ApiError, ApiResponse } from "@/contracts/api";
import { ApiServiceError } from "@/src/lib/api/serviceError";

export type { AdminMenuData, CreateLatteWithPowderResponse } from "@/contracts/admin/catalog";

// ── URL map ──────────────────────────────────────────────────────────────────

const URL = {
  list: "/api/admin/menu",
  byId: (id: string) => `/api/admin/menu/${id}`,
  createLatteWithPowder: "/api/admin/menu/create-latte-with-powder",
  reorder: "/api/admin/menu/reorder",
} as const;

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
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.data) {
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
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.data) {
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
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.data) {
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

/** Persist a complete menu ordering snapshot and return the canonical ranks. */
export async function reorderAdminMenu(payload: MenuReorderPayload): Promise<MenuReorderResult> {
  try {
    const response = await apiClient.put<ApiResponse<MenuReorderResult>>(URL.reorder, payload);
    return response.data.data;
  } catch (error: unknown) {
    if (axios.isAxiosError<ApiError>(error) && error.response?.data?.error) {
      const apiError = error.response.data;
      throw new ApiServiceError(
        apiError.error,
        error.response.status,
        apiError.code,
        apiError.details,
      );
    }
    throw error;
  }
}
