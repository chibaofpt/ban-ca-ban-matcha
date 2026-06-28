import { apiClient } from "@/src/lib/api/client";
import type { AdminAddonGroup } from "@/src/lib/types/addonGroup";
import type { CreateAddonGroupInput, UpdateAddonGroupInput } from "@/lib/validations/addonGroup";

export interface AdminAddonGroupApiResponse {
  data: AdminAddonGroup[];
}

export interface AdminSingleAddonGroupResponse {
  data: AdminAddonGroup;
}

export async function listAdminAddonGroups(): Promise<AdminAddonGroup[]> {
  const { data } = await apiClient.get<AdminAddonGroupApiResponse>("/api/admin/addon-groups");
  return data.data;
}

export async function createAddonGroup(payload: CreateAddonGroupInput): Promise<AdminAddonGroup> {
  const { data } = await apiClient.post<AdminSingleAddonGroupResponse>("/api/admin/addon-groups", payload);
  return data.data;
}

export async function updateAddonGroup(id: string, payload: UpdateAddonGroupInput): Promise<AdminAddonGroup> {
  const { data } = await apiClient.put<AdminSingleAddonGroupResponse>(`/api/admin/addon-groups/${id}`, payload);
  return data.data;
}

export async function toggleAddonGroupActive(id: string, is_active: boolean): Promise<AdminAddonGroup> {
  const { data } = await apiClient.put<AdminSingleAddonGroupResponse>(`/api/admin/addon-groups/${id}`, { is_active });
  return data.data;
}

export async function deleteAddonGroup(id: string): Promise<AdminAddonGroup> {
  const { data } = await apiClient.delete<AdminSingleAddonGroupResponse>(`/api/admin/addon-groups/${id}`);
  return data.data;
}
