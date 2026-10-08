import { apiClient } from "@/src/lib/api/client";
import axios from "axios";
import { ApiServiceError } from "@/src/lib/api/serviceError";
import type { ApiError, ApiResponse } from "@/contracts/api";
import type { Powder } from "@/contracts/catalog";
import type { PowderMutationPayload, FusionPowderReplacement } from "@/contracts/admin/catalog";

const URL = {
  list: "/api/admin/powders",
  byId: (id: string) => `/api/admin/powders/${id}`,
} as const;

async function preserveApiError<T>(request: () => Promise<T>): Promise<T> {
  try { return await request(); } catch (error: unknown) {
    if (axios.isAxiosError<ApiError>(error) && error.response?.data?.error) {
      const body = error.response.data;
      throw new ApiServiceError(body.error, error.response.status, body.code, body.details);
    }
    throw error;
  }
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
  const { data } = await apiClient.get<ApiResponse<Powder[]>>(URL.list);
  return data.data;
}

/** Create a powder with an optional cropped image. */
export async function createPowder(
  payload: PowderMutationPayload,
  imageFile?: File | null,
  imageFilename?: string,
): Promise<Powder> {
  const body = buildMultipartPayload(payload, imageFile, imageFilename);
  const { data } = await apiClient.post<ApiResponse<Powder>>(URL.list, body);
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
  const { data } = await preserveApiError(() => apiClient.put<ApiResponse<Powder>>(URL.byId(id), body));
  return data.data;
}

/** Toggle powder availability without uploading an image. */
export async function togglePowderAvailability(id: string, is_available: boolean, replacements?: FusionPowderReplacement[]): Promise<Powder> {
  const payload = { is_available, ...(replacements ? { fusion_powder_replacements: replacements } : {}) };
  const { data } = await preserveApiError(() => apiClient.put<ApiResponse<Powder>>(URL.byId(id), payload));
  return data.data;
}

/** Soft-delete a powder with optional explicit Fusion replacements. */
export async function deletePowder(id: string, replacements?: FusionPowderReplacement[]): Promise<Powder> {
  const { data } = await preserveApiError(() => replacements
    ? apiClient.delete<ApiResponse<Powder>>(URL.byId(id), { data: { fusion_powder_replacements: replacements } })
    : apiClient.delete<ApiResponse<Powder>>(URL.byId(id)));
  return data.data;
}
