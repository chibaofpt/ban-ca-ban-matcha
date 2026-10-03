import { apiClient } from "@/src/lib/api/client";
import type { ApiError, ApiResponse } from "@/src/lib/types/api";
import type { OpenWelcomeRewardPayload, WelcomeReward } from "@/contracts/reward";
import { ApiServiceError } from "@/src/lib/api/serviceError";

export type {
  OpenWelcomeRewardPayload,
  RewardCampaignStatus,
  WelcomeReward,
  WelcomeRewardBox,
  WelcomeRewardCampaign,
  WelcomeRewardMode,
  WelcomeRewardOutcome,
  WelcomeRewardOutcomeKind,
  WelcomeRewardStatus,
  WelcomeRewardSummary,
} from "@/contracts/reward";

const URL = {
  welcome: "/api/customer/rewards/welcome",
  open: "/api/customer/rewards/welcome/open",
} as const;

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
