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

function buildMultipartPayload(
  payload: CreateMilkTypeInput | UpdateMilkTypeInput,
  imageFile?: File | null,
  imageFilename?: string | null,
): FormData | (CreateMilkTypeInput | UpdateMilkTypeInput) {
  if (!imageFile && !imageFilename && !("remove_image" in payload && payload.remove_image)) {
    return payload; // fallback to json
  }
  const formData = new FormData();
  formData.set("payload", JSON.stringify(payload));
  if (imageFile) formData.set("image", imageFile);
  if (imageFilename?.trim()) formData.set("image_filename", imageFilename.trim());
  return formData;
}

export async function createMilkType(
  payload: CreateMilkTypeInput,
  imageFile?: File | null,
  imageFilename?: string | null,
): Promise<AdminMilkType> {
  const body = buildMultipartPayload(payload, imageFile, imageFilename);
  const config = body instanceof FormData ? { headers: { "Content-Type": "multipart/form-data" } } : undefined;
  const { data } = await apiClient.post<AdminSingleMilkTypeResponse>("/api/admin/milk-types", body, config);
  return data.data;
}

export async function updateMilkType(
  id: string,
  payload: UpdateMilkTypeInput,
  imageFile?: File | null,
  imageFilename?: string | null,
): Promise<AdminMilkType> {
  const body = buildMultipartPayload(payload, imageFile, imageFilename);
  const config = body instanceof FormData ? { headers: { "Content-Type": "multipart/form-data" } } : undefined;
  const { data } = await apiClient.put<AdminSingleMilkTypeResponse>(`/api/admin/milk-types/${id}`, body, config);
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
