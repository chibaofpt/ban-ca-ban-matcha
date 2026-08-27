import { apiClient } from "@/src/lib/api/client";
import type {
  AdminAddonGroup,
  AddonGroupMutationPayload,
  AddonOptionImageUpload,
} from "@/src/lib/types/addonGroup";

const URL = {
  list: "/api/admin/addon-groups",
  byId: (id: string) => `/api/admin/addon-groups/${id}`,
} as const;

export interface AdminAddonGroupApiResponse {
  data: AdminAddonGroup[];
}

export interface AdminSingleAddonGroupResponse {
  data: AdminAddonGroup;
}

function buildMultipartPayload(
  payload: AddonGroupMutationPayload,
  imageFile?: File | null,
  imageFilename?: string,
  optionImages: AddonOptionImageUpload[] = [],
): FormData {
  const formData = new FormData();
  formData.set("payload", JSON.stringify(payload));
  if (imageFile) formData.set("image", imageFile);
  if (imageFilename?.trim()) formData.set("image_filename", imageFilename.trim());
  for (const optionImage of optionImages) {
    if (optionImage.imageFile) {
      formData.set(`option_image_${optionImage.imageKey}`, optionImage.imageFile);
    }
    if (optionImage.imageFilename.trim()) {
      formData.set(
        `option_image_filename_${optionImage.imageKey}`,
        optionImage.imageFilename.trim(),
      );
    }
  }
  return formData;
}

/** List every addon group for admin management. */
export async function listAdminAddonGroups(): Promise<AdminAddonGroup[]> {
  const { data } = await apiClient.get<AdminAddonGroupApiResponse>(URL.list);
  return data.data;
}

/** Create an addon group with an optional cropped image. */
export async function createAddonGroup(
  payload: AddonGroupMutationPayload,
  imageFile?: File | null,
  imageFilename?: string,
  optionImages: AddonOptionImageUpload[] = [],
): Promise<AdminAddonGroup> {
  const body = buildMultipartPayload(payload, imageFile, imageFilename, optionImages);
  const { data } = await apiClient.post<AdminSingleAddonGroupResponse>(URL.list, body);
  return data.data;
}

/** Update an addon group with an optional replacement or renamed image. */
export async function updateAddonGroup(
  id: string,
  payload: AddonGroupMutationPayload,
  imageFile?: File | null,
  imageFilename?: string,
  optionImages: AddonOptionImageUpload[] = [],
): Promise<AdminAddonGroup> {
  const body = buildMultipartPayload(payload, imageFile, imageFilename, optionImages);
  const { data } = await apiClient.put<AdminSingleAddonGroupResponse>(URL.byId(id), body);
  return data.data;
}

/** Toggle addon group activity without uploading an image. */
export async function toggleAddonGroupActive(id: string, is_active: boolean): Promise<AdminAddonGroup> {
  const { data } = await apiClient.put<AdminSingleAddonGroupResponse>(URL.byId(id), { is_active });
  return data.data;
}

/** Soft-delete an addon group. */
export async function deleteAddonGroup(id: string): Promise<AdminAddonGroup> {
  const { data } = await apiClient.delete<AdminSingleAddonGroupResponse>(URL.byId(id));
  return data.data;
}
