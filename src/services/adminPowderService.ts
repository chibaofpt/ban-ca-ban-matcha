import { apiClient } from "@/src/lib/api/client";
import type { Powder, PowderMutationPayload } from "@/src/lib/types/powder";

const URL = {
  list: "/api/admin/powders",
  byId: (id: string) => `/api/admin/powders/${id}`,
} as const;

export interface AdminPowderApiResponse {
  data: Powder[];
}

export interface AdminSinglePowderResponse {
  data: Powder;
}

function buildMultipartPayload(
  payload: PowderMutationPayload,
  imageFile?: File | null,
  imageFilename?: string,
): FormData {
  const formData = new FormData();
  formData.set("payload", JSON.stringify(payload));
  if (imageFile) formData.set("image", imageFile);
  if (imageFilename?.trim()) formData.set("image_filename", imageFilename.trim());
  return formData;
}

/** List every powder for admin management. */
export async function listAdminPowders(): Promise<Powder[]> {
  const { data } = await apiClient.get<AdminPowderApiResponse>(URL.list);
  return data.data;
}

/** Create a powder with an optional cropped image. */
export async function createPowder(
  payload: PowderMutationPayload,
  imageFile?: File | null,
  imageFilename?: string,
): Promise<Powder> {
  const body = buildMultipartPayload(payload, imageFile, imageFilename);
  const { data } = await apiClient.post<AdminSinglePowderResponse>(URL.list, body);
  return data.data;
}

/** Update a powder with an optional replacement or renamed image. */
export async function updatePowder(
  id: string,
  payload: PowderMutationPayload,
  imageFile?: File | null,
  imageFilename?: string,
): Promise<Powder> {
  const body = buildMultipartPayload(payload, imageFile, imageFilename);
  const { data } = await apiClient.put<AdminSinglePowderResponse>(URL.byId(id), body);
  return data.data;
}

/** Toggle powder availability without uploading an image. */
export async function togglePowderAvailability(id: string, is_available: boolean): Promise<Powder> {
  const { data } = await apiClient.put<AdminSinglePowderResponse>(URL.byId(id), { is_available });
  return data.data;
}

/** Soft-delete a powder. */
export async function deletePowder(id: string): Promise<Powder> {
  const { data } = await apiClient.delete<AdminSinglePowderResponse>(URL.byId(id));
  return data.data;
}
