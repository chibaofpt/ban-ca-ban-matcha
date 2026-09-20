import type {
  RewardCampaignStatus,
  WelcomeRewardBox,
  WelcomeRewardMode,
} from "../reward";

export type AdminRewardMode = WelcomeRewardMode;
export type AdminRewardCampaignStatus = RewardCampaignStatus;
export type AdminRewardBox = WelcomeRewardBox;

export interface AdminWelcomeRewardSettings {
  mode: AdminRewardMode;
  fixed_package_id: string | null;
  active_campaign_id: string | null;
  revision: number;
}

export interface AdminWelcomeRewardSettingsInput {
  mode: AdminRewardMode;
  fixed_package_id?: string | null;
  active_campaign_id?: string | null;
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
  voucher_package: {
    name: string;
    is_active: boolean;
    ends_at: string | null;
  };
  quantity: number;
  unlock_after_draws: number;
  issued_count: number;
  remaining_quantity: number;
  unlocked: boolean;
  current_weight: number;
  eligible_weight_total: number;
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

export type AdminRewardCampaignTransition = "ACTIVATE" | "PAUSE" | "RESUME" | "END";
export type AdminRewardCampaignAction =
  | { action: "RENAME"; revision: number; name: string }
  | { action: AdminRewardCampaignTransition; revision: number };

export interface AdminRewardCampaignCreateInput {
  name: string;
}

export interface AdminRewardPoolReplaceInput {
  revision: number;
  items: AdminRewardPoolInput[];
}

export interface AdminRewardBoxMutationResult {
  box: AdminRewardBox;
  campaign: AdminRewardCampaign;
}

export interface AdminRewardBoxDeleteResult {
  deleted: true;
  revision: number;
}
