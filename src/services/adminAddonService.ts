import { isAxiosError } from "axios";
import { apiClient } from "@/src/lib/api/client";
import type { ApiError } from "@/src/lib/types/api";
import { ApiServiceError } from "@/src/services/orderService";
import type {
  AdminAddonGroup,
  AddonGroupMutationPayload,
  AddonOptionImageUpload,
  AddonGroupDetailsMutationPayload,
  AddonGroupReorderEntry,
  AddonOptionCreatePayload,
  AddonOptionDetailsMutationPayload,
} from "@/src/lib/types/addonGroup";

const URL = {
  list: "/api/admin/addon-groups",
  byId: (id: string) => `/api/admin/addon-groups/${id}`,
  reorder: "/api/admin/addon-groups/reorder",
  options: (groupId: string) => `/api/admin/addon-groups/${groupId}/options`,
  optionById: (groupId: string, optionId: string) =>
    `/api/admin/addon-groups/${groupId}/options/${optionId}`,
} as const;

export interface AdminAddonGroupApiResponse {
  data: AdminAddonGroup[];
}

export interface AdminSingleAddonGroupResponse {
  data: AdminAddonGroup;
}

async function preserveApiError<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error: unknown) {
    if (isAxiosError<ApiError>(error) && error.response?.data?.error) {
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

function buildEntityMultipartPayload(
  payload: object,
  imageFile?: File | null,
  imageFilename?: string,
): FormData {
  const formData = new FormData();
  formData.set("payload", JSON.stringify(payload));
  if (imageFile) formData.set("image", imageFile);
  if (imageFilename?.trim()) formData.set("image_filename", imageFilename.trim());
  return formData;
}

/** List every addon group for admin management. */
export async function listAdminAddonGroups(): Promise<AdminAddonGroup[]> {
  return preserveApiError(async () => {
    const { data } = await apiClient.get<AdminAddonGroupApiResponse>(URL.list);
    return data.data;
  });
}

/** Create an addon group with an optional cropped image. */
export async function createAddonGroup(
  payload: AddonGroupMutationPayload,
  imageFile?: File | null,
  imageFilename?: string,
  optionImages: AddonOptionImageUpload[] = [],
): Promise<AdminAddonGroup> {
  return preserveApiError(async () => {
    const body = buildMultipartPayload(payload, imageFile, imageFilename, optionImages);
    const { data } = await apiClient.post<AdminSingleAddonGroupResponse>(URL.list, body);
    return data.data;
  });
}

/** Update an addon group with an optional replacement or renamed image. */
export async function updateAddonGroup(
  id: string,
  payload: AddonGroupMutationPayload,
  imageFile?: File | null,
  imageFilename?: string,
  optionImages: AddonOptionImageUpload[] = [],
): Promise<AdminAddonGroup> {
  return preserveApiError(async () => {
    const body = buildMultipartPayload(payload, imageFile, imageFilename, optionImages);
    const { data } = await apiClient.put<AdminSingleAddonGroupResponse>(URL.byId(id), body);
    return data.data;
  });
}

/** Update only the inline-editable details of an existing add-on group. */
export async function updateAddonGroupDetails(
  id: string,
  payload: AddonGroupDetailsMutationPayload,
  imageFile?: File | null,
  imageFilename?: string,
): Promise<AdminAddonGroup> {
  return preserveApiError(async () => {
    const body = buildEntityMultipartPayload(payload, imageFile, imageFilename);
    const { data } = await apiClient.put<AdminSingleAddonGroupResponse>(URL.byId(id), body);
    return data.data;
  });
}

/** Append a new option to an existing add-on group. */
export async function createAddonOption(
  groupId: string,
  payload: AddonOptionCreatePayload,
  imageFile?: File | null,
  imageFilename?: string,
): Promise<AdminAddonGroup> {
  return preserveApiError(async () => {
    const body = buildEntityMultipartPayload(payload, imageFile, imageFilename);
    const { data } = await apiClient.post<AdminSingleAddonGroupResponse>(URL.options(groupId), body);
    return data.data;
  });
}

/** Update only the inline-editable details of one add-on option. */
export async function updateAddonOptionDetails(
  groupId: string,
  optionId: string,
  payload: AddonOptionDetailsMutationPayload,
  imageFile?: File | null,
  imageFilename?: string,
): Promise<AdminAddonGroup> {
  return preserveApiError(async () => {
    const body = buildEntityMultipartPayload(payload, imageFile, imageFilename);
    const { data } = await apiClient.put<AdminSingleAddonGroupResponse>(
      URL.optionById(groupId, optionId),
      body,
    );
    return data.data;
  });
}

/** Toggle one add-on option without mutating its details or display rank. */
export async function toggleAddonOptionActive(
  groupId: string,
  optionId: string,
  is_active: boolean,
): Promise<AdminAddonGroup> {
  return preserveApiError(async () => {
    const { data } = await apiClient.put<AdminSingleAddonGroupResponse>(
      URL.optionById(groupId, optionId),
      { is_active },
    );
    return data.data;
  });
}

/** Persist the complete ordered add-on catalogue and return its canonical order. */
export async function reorderAddonGroups(
  groups: AddonGroupReorderEntry[],
): Promise<AdminAddonGroup[]> {
  return preserveApiError(async () => {
    const { data } = await apiClient.put<AdminAddonGroupApiResponse>(URL.reorder, { groups });
    return data.data;
  });
}

/** Toggle addon group activity without uploading an image. */
export async function toggleAddonGroupActive(id: string, is_active: boolean): Promise<AdminAddonGroup> {
  return preserveApiError(async () => {
    const { data } = await apiClient.put<AdminSingleAddonGroupResponse>(URL.byId(id), { is_active });
    return data.data;
  });
}

/** Soft-delete an addon group. */
export async function deleteAddonGroup(id: string): Promise<AdminAddonGroup> {
  return preserveApiError(async () => {
    const { data } = await apiClient.delete<AdminSingleAddonGroupResponse>(URL.byId(id));
    return data.data;
  });
}
