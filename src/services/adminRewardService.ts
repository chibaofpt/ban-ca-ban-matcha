import { apiClient } from "@/src/lib/api/client";
import type { ApiError, ApiResponse } from "@/src/lib/types/api";
import { ApiServiceError } from "@/src/services/orderService";

const URL = {
  settings: "/api/admin/welcome-reward-settings",
  campaigns: "/api/admin/reward-campaigns",
  campaign: (id: string) => `/api/admin/reward-campaigns/${id}`,
  pool: (id: string) => `/api/admin/reward-campaigns/${id}/pool`,
  boxes: (id: string) => `/api/admin/reward-campaigns/${id}/boxes`,
  box: (id: string, boxId: string) => `/api/admin/reward-campaigns/${id}/boxes/${boxId}`,
} as const;

export type AdminRewardMode = "POINTS" | "FIXED_VOUCHER" | "GACHA";
export type AdminRewardCampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED";

export interface AdminWelcomeRewardSettings {
  mode: AdminRewardMode;
  fixed_package_id: string | null;
  active_campaign_id: string | null;
  revision: number;
}

export interface AdminRewardCampaignSummary {
  id: string;
  name: string;
  status: AdminRewardCampaignStatus;
  revision: number;
  created_at: string;
  updated_at: string;
  draw_count: number;
  total_allocated: number;
  total_remaining: number;
  box_count: number;
}

export interface AdminRewardPoolItem {
  id: string;
  voucher_package_id: string;
  voucher_package: { name: string; is_active: boolean; ends_at: string | null };
  quantity: number;
  unlock_after_draws: number;
  issued_count: number;
  remaining_quantity: number;
  unlocked: boolean;
  current_weight: number;
  eligible_weight_total: number;
}

export interface AdminRewardBox {
  id: string;
  name: string;
  closed_image_url: string;
  open_image_url: string;
  mouth_anchor_x: number;
  mouth_anchor_y: number;
  sort_order: number;
}

export interface AdminRewardCampaign extends AdminRewardCampaignSummary {
  pool_items: AdminRewardPoolItem[];
  boxes: AdminRewardBox[];
}

export interface AdminRewardPoolInput {
  voucher_package_id: string;
  quantity: number;
  unlock_after_draws: number;
}

export type AdminRewardCampaignAction =
  | { action: "RENAME"; revision: number; name: string }
  | { action: "ACTIVATE" | "PAUSE" | "RESUME" | "END"; revision: number };

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
export async function updateAdminWelcomeRewardSettings(input: AdminWelcomeRewardSettings): Promise<AdminWelcomeRewardSettings> {
  return preserveApiError(async () => (await apiClient.put<ApiResponse<{ settings: AdminWelcomeRewardSettings }>>(URL.settings, input)).data.data.settings);
}

/** List all reward campaign summaries. */
export async function listAdminRewardCampaigns(): Promise<AdminRewardCampaignSummary[]> {
  return preserveApiError(async () => (await apiClient.get<ApiResponse<{ items: AdminRewardCampaignSummary[] }>>(URL.campaigns)).data.data.items);
}

/** Create one draft reward campaign. */
export async function createAdminRewardCampaign(input: { name: string }): Promise<AdminRewardCampaign> {
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
export async function replaceAdminRewardPool(id: string, input: { revision: number; items: AdminRewardPoolInput[] }): Promise<AdminRewardCampaign> {
  return preserveApiError(async () => (await apiClient.put<ApiResponse<{ campaign: AdminRewardCampaign }>>(URL.pool(id), input)).data.data.campaign);
}

/** Add one visual box using browser-managed multipart headers. */
export async function createAdminRewardBox(id: string, input: AdminRewardBoxCreateInput): Promise<{ box: AdminRewardBox; campaign: AdminRewardCampaign }> {
  return preserveApiError(async () => (await apiClient.post<ApiResponse<{ box: AdminRewardBox; campaign: AdminRewardCampaign }>>(URL.boxes(id), toBoxFormData(input))).data.data);
}

/** Update at least one visual box field using browser-managed multipart headers. */
export async function updateAdminRewardBox(id: string, boxId: string, input: AdminRewardBoxUpdateInput): Promise<{ box: AdminRewardBox; campaign: AdminRewardCampaign }> {
  return preserveApiError(async () => (await apiClient.patch<ApiResponse<{ box: AdminRewardBox; campaign: AdminRewardCampaign }>>(URL.box(id, boxId), toBoxFormData(input))).data.data);
}

/** Delete one visual box with revision protection. */
export async function deleteAdminRewardBox(id: string, boxId: string, revision: number): Promise<{ deleted: true; revision: number }> {
  return preserveApiError(async () => (await apiClient.delete<ApiResponse<{ deleted: true; revision: number }>>(URL.box(id, boxId), { data: { revision } })).data.data);
}
