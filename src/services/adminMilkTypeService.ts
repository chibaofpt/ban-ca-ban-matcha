import { apiClient } from "@/src/lib/api/client";
import type { AdminMilkType } from "@/src/lib/types/milkType";
import type { CreateMilkTypeInput, UpdateMilkTypeInput } from "@/lib/validations/milkType";

export interface AdminMilkTypeApiResponse {
  data: AdminMilkType[];
}

export interface AdminSingleMilkTypeResponse {
  data: AdminMilkType;
}

export async function listAdminMilkTypes(): Promise<AdminMilkType[]> {
  const { data } = await apiClient.get<AdminMilkTypeApiResponse>("/api/admin/milk-types");
  return data.data;
}

export async function createMilkType(payload: CreateMilkTypeInput): Promise<AdminMilkType> {
  const { data } = await apiClient.post<AdminSingleMilkTypeResponse>("/api/admin/milk-types", payload);
  return data.data;
}

export async function updateMilkType(id: string, payload: UpdateMilkTypeInput): Promise<AdminMilkType> {
  const { data } = await apiClient.put<AdminSingleMilkTypeResponse>(`/api/admin/milk-types/${id}`, payload);
  return data.data;
}

export async function toggleMilkTypeActive(id: string, is_active: boolean): Promise<AdminMilkType> {
  const { data } = await apiClient.put<AdminSingleMilkTypeResponse>(`/api/admin/milk-types/${id}`, { is_active });
  return data.data;
}

export async function deleteMilkType(id: string): Promise<AdminMilkType> {
  const { data } = await apiClient.delete<AdminSingleMilkTypeResponse>(`/api/admin/milk-types/${id}`);
  return data.data;
}

export async function reorderMilkType(id: string, display_order: number): Promise<AdminMilkType> {
  const { data } = await apiClient.put<AdminSingleMilkTypeResponse>(`/api/admin/milk-types/${id}`, { display_order });
  return data.data;
}
