import { apiClient } from "@/src/lib/api/client";
import type { ApiError, ApiResponse } from "@/src/lib/types/api";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import { ApiServiceError } from "@/src/services/orderService";

const URL = {
  welcome: "/api/customer/rewards/welcome",
  open: "/api/customer/rewards/welcome/open",
} as const;

export type WelcomeRewardMode = "POINTS" | "FIXED_VOUCHER" | "GACHA";
export type WelcomeRewardStatus = "PENDING" | "COMPLETED";
export type WelcomeRewardOutcomeKind = "VOUCHER" | "POINTS";

export interface WelcomeRewardSummary {
  id: string;
  mode: WelcomeRewardMode;
  status: WelcomeRewardStatus;
  outcome_kind: WelcomeRewardOutcomeKind | null;
}

export interface WelcomeRewardBox {
  id: string;
  name: string;
  closed_image_url: string;
  open_image_url: string;
  mouth_anchor_x: number;
  mouth_anchor_y: number;
  sort_order: number;
}

export interface WelcomeRewardCampaign {
  id: string;
  name: string;
  status: string;
  boxes: WelcomeRewardBox[];
}

export type WelcomeRewardOutcome =
  | { kind: "POINTS"; points: 5 }
  | { kind: "VOUCHER"; voucher: MyVoucher };

export interface WelcomeReward {
  id: string;
  mode: WelcomeRewardMode;
  status: WelcomeRewardStatus;
  can_open: boolean;
  unavailable_reason: string | null;
  campaign: WelcomeRewardCampaign | null;
  outcome: WelcomeRewardOutcome | null;
}

export interface OpenWelcomeRewardPayload {
  reward_id: string;
  box_id: string;
  request_id: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function preserveApiError(error: unknown): ApiServiceError | null {
  if (!isRecord(error) || !isRecord(error.response)) return null;
  const status = error.response.status;
  const data = error.response.data;
  if (typeof status !== "number" || !isRecord(data) || typeof data.error !== "string" || typeof data.code !== "string") {
    return null;
  }
  const payload: ApiError = {
    error: data.error,
    code: data.code,
    ...( "details" in data ? { details: data.details } : {}),
  };
  return new ApiServiceError(payload.error, status, payload.code, payload.details);
}

/** Fetch the current customer's welcome reward entitlement. */
export async function getWelcomeReward(): Promise<WelcomeReward | null> {
  try {
    const response = await apiClient.get<ApiResponse<{ reward: WelcomeReward | null }>>(URL.welcome);
    return response.data.data.reward;
  } catch (error: unknown) {
    throw preserveApiError(error) ?? error;
  }
}

/** Open one visual box using the server-authoritative welcome reward outcome. */
export async function openWelcomeReward(payload: OpenWelcomeRewardPayload): Promise<WelcomeReward> {
  try {
    const response = await apiClient.post<ApiResponse<{ reward: WelcomeReward }>>(URL.open, payload);
    return response.data.data.reward;
  } catch (error: unknown) {
    throw preserveApiError(error) ?? error;
  }
}
