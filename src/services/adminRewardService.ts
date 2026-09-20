import { apiClient } from "@/src/lib/api/client";
import type { ApiError, ApiResponse } from "@/src/lib/types/api";
import type {
  AdminRewardBox,
  AdminRewardBoxDeleteResult,
  AdminRewardBoxMutationResult,
  AdminRewardCampaign,
  AdminRewardCampaignAction,
  AdminRewardCampaignCreateInput,
  AdminRewardCampaignSummary,
  AdminRewardPoolInput,
  AdminRewardPoolReplaceInput,
  AdminWelcomeRewardSettings,
  AdminWelcomeRewardSettingsInput,
} from "@/contracts/admin/reward";
import { ApiServiceError } from "@/src/lib/api/serviceError";

export type {
  AdminRewardBox,
  AdminRewardBoxDeleteResult,
  AdminRewardBoxMutationResult,
  AdminRewardCampaign,
  AdminRewardCampaignAction,
  AdminRewardCampaignCreateInput,
  AdminRewardCampaignStatus,
  AdminRewardCampaignSummary,
  AdminRewardCampaignTransition,
  AdminRewardMode,
  AdminRewardPoolInput,
  AdminRewardPoolItem,
  AdminRewardPoolReplaceInput,
  AdminWelcomeRewardSettings,
  AdminWelcomeRewardSettingsInput,
} from "@/contracts/admin/reward";

const URL = {
  settings: "/api/admin/welcome-reward-settings",
  campaigns: "/api/admin/reward-campaigns",
  campaign: (id: string) => `/api/admin/reward-campaigns/${id}`,
  pool: (id: string) => `/api/admin/reward-campaigns/${id}/pool`,
  boxes: (id: string) => `/api/admin/reward-campaigns/${id}/boxes`,
  box: (id: string, boxId: string) => `/api/admin/reward-campaigns/${id}/boxes/${boxId}`,
} as const;

export interface AdminRewardBoxCreateInput {
  revision: number;
  name: string;
  mouth_anchor_x: number;
  mouth_anchor_y: number;
  closed_image: File;
  open_image: File;
}

export interface AdminRewardBoxUpdateInput {
  revision: number;
  name?: string;
  mouth_anchor_x?: number;
  mouth_anchor_y?: number;
  closed_image?: File;
  open_image?: File;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function preserveApiError<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error: unknown) {
    if (!isRecord(error) || !isRecord(error.response)) throw error;
    const status = error.response.status;
    const data = error.response.data;
    if (typeof status !== "number" || !isRecord(data) || typeof data.error !== "string" || typeof data.code !== "string") throw error;
    const payload: ApiError = { error: data.error, code: data.code, ...( "details" in data ? { details: data.details } : {}) };
    throw new ApiServiceError(payload.error, status, payload.code, payload.details);
  }
}

function toBoxFormData(input: AdminRewardBoxCreateInput | AdminRewardBoxUpdateInput): FormData {
  const form = new FormData();
  form.set("revision", String(input.revision));
  if (input.name !== undefined) form.set("name", input.name);
  if (input.mouth_anchor_x !== undefined) form.set("mouth_anchor_x", String(input.mouth_anchor_x));
  if (input.mouth_anchor_y !== undefined) form.set("mouth_anchor_y", String(input.mouth_anchor_y));
  if (input.closed_image) form.set("closed_image", input.closed_image);
  if (input.open_image) form.set("open_image", input.open_image);
  return form;
}

/** Read singleton welcome-reward settings. */
export async function getAdminWelcomeRewardSettings(): Promise<AdminWelcomeRewardSettings> {
  return preserveApiError(async () => (await apiClient.get<ApiResponse<{ settings: AdminWelcomeRewardSettings }>>(URL.settings)).data.data.settings);
}

/** Update singleton welcome-reward settings with revision protection. */
export async function updateAdminWelcomeRewardSettings(input: AdminWelcomeRewardSettingsInput): Promise<AdminWelcomeRewardSettings> {
  return preserveApiError(async () => (await apiClient.put<ApiResponse<{ settings: AdminWelcomeRewardSettings }>>(URL.settings, input)).data.data.settings);
}

/** List all reward campaign summaries. */
export async function listAdminRewardCampaigns(): Promise<AdminRewardCampaignSummary[]> {
  return preserveApiError(async () => (await apiClient.get<ApiResponse<{ items: AdminRewardCampaignSummary[] }>>(URL.campaigns)).data.data.items);
}

/** Create one draft reward campaign. */
export async function createAdminRewardCampaign(input: AdminRewardCampaignCreateInput): Promise<AdminRewardCampaign> {
  return preserveApiError(async () => (await apiClient.post<ApiResponse<{ campaign: AdminRewardCampaign }>>(URL.campaigns, input)).data.data.campaign);
}

/** Read one reward campaign with pool and box projections. */
export async function getAdminRewardCampaign(id: string): Promise<AdminRewardCampaign> {
  return preserveApiError(async () => (await apiClient.get<ApiResponse<{ campaign: AdminRewardCampaign }>>(URL.campaign(id))).data.data.campaign);
}

/** Rename or transition one campaign. */
export async function mutateAdminRewardCampaign(id: string, input: AdminRewardCampaignAction): Promise<AdminRewardCampaign> {
  return preserveApiError(async () => (await apiClient.patch<ApiResponse<{ campaign: AdminRewardCampaign }>>(URL.campaign(id), input)).data.data.campaign);
}

/** Replace one draft campaign's weighted pool. */
export async function replaceAdminRewardPool(id: string, input: AdminRewardPoolReplaceInput): Promise<AdminRewardCampaign> {
  return preserveApiError(async () => (await apiClient.put<ApiResponse<{ campaign: AdminRewardCampaign }>>(URL.pool(id), input)).data.data.campaign);
}

/** Add one visual box using browser-managed multipart headers. */
export async function createAdminRewardBox(id: string, input: AdminRewardBoxCreateInput): Promise<AdminRewardBoxMutationResult> {
  return preserveApiError(async () => (await apiClient.post<ApiResponse<AdminRewardBoxMutationResult>>(URL.boxes(id), toBoxFormData(input))).data.data);
}

/** Update at least one visual box field using browser-managed multipart headers. */
export async function updateAdminRewardBox(id: string, boxId: string, input: AdminRewardBoxUpdateInput): Promise<AdminRewardBoxMutationResult> {
  return preserveApiError(async () => (await apiClient.patch<ApiResponse<AdminRewardBoxMutationResult>>(URL.box(id, boxId), toBoxFormData(input))).data.data);
}

/** Delete one visual box with revision protection. */
export async function deleteAdminRewardBox(id: string, boxId: string, revision: number): Promise<AdminRewardBoxDeleteResult> {
  return preserveApiError(async () => (await apiClient.delete<ApiResponse<AdminRewardBoxDeleteResult>>(URL.box(id, boxId), { data: { revision } })).data.data);
}
