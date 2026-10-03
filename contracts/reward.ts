import type { MyVoucher } from "./voucher";

export type WelcomeRewardMode = "POINTS" | "FIXED_VOUCHER" | "GACHA";
export type WelcomeRewardStatus = "PENDING" | "COMPLETED";
export type WelcomeRewardOutcomeKind = "VOUCHER" | "POINTS";
export type RewardCampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED";

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
  status: RewardCampaignStatus;
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
  unavailable_reason: "REWARD_PAUSED" | null;
  campaign: WelcomeRewardCampaign | null;
  outcome: WelcomeRewardOutcome | null;
}

export interface OpenWelcomeRewardPayload {
  reward_id: string;
  box_id: string;
  request_id: string;
}
