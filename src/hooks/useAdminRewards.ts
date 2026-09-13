"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_REWARD_QUERY_KEYS } from "@/src/constants/adminRewardQueryKeys";
import {
  createAdminRewardBox,
  createAdminRewardCampaign,
  deleteAdminRewardBox,
  getAdminRewardCampaign,
  getAdminWelcomeRewardSettings,
  listAdminRewardCampaigns,
  mutateAdminRewardCampaign,
  replaceAdminRewardPool,
  updateAdminRewardBox,
  updateAdminWelcomeRewardSettings,
  type AdminRewardBoxCreateInput,
  type AdminRewardBoxUpdateInput,
  type AdminRewardCampaign,
  type AdminRewardCampaignAction,
  type AdminRewardPoolInput,
  type AdminWelcomeRewardSettings,
} from "@/src/services/adminRewardService";

/** Read admin welcome-reward settings and campaign summaries. */
export function useAdminRewardOverview() {
  const settings = useQuery({ queryKey: ADMIN_REWARD_QUERY_KEYS.SETTINGS, queryFn: getAdminWelcomeRewardSettings });
  const campaigns = useQuery({ queryKey: ADMIN_REWARD_QUERY_KEYS.CAMPAIGNS, queryFn: listAdminRewardCampaigns });
  return { settings, campaigns };
}

/** Read one selected admin reward campaign. */
export function useAdminRewardCampaign(id: string | null) {
  return useQuery({
    queryKey: ADMIN_REWARD_QUERY_KEYS.CAMPAIGN(id ?? "none"),
    queryFn: () => getAdminRewardCampaign(id!),
    enabled: id !== null,
  });
}

/** Create cache-aware mutations for the admin reward editor. */
export function useAdminRewardMutations() {
  const client = useQueryClient();
  const commitCampaign = (campaign: AdminRewardCampaign) => {
    client.setQueryData(ADMIN_REWARD_QUERY_KEYS.CAMPAIGN(campaign.id), campaign);
    void client.invalidateQueries({ queryKey: ADMIN_REWARD_QUERY_KEYS.CAMPAIGNS });
  };
  const settings = useMutation({
    mutationFn: updateAdminWelcomeRewardSettings,
    onSuccess: (value) => client.setQueryData(ADMIN_REWARD_QUERY_KEYS.SETTINGS, value),
  });
  const createCampaign = useMutation({
    mutationFn: createAdminRewardCampaign,
    onSuccess: commitCampaign,
  });
  const campaign = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdminRewardCampaignAction }) => mutateAdminRewardCampaign(id, input),
    onSuccess: commitCampaign,
  });
  const pool = useMutation({
    mutationFn: ({ id, revision, items }: { id: string; revision: number; items: AdminRewardPoolInput[] }) => replaceAdminRewardPool(id, { revision, items }),
    onSuccess: commitCampaign,
  });
  const createBox = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdminRewardBoxCreateInput }) => createAdminRewardBox(id, input),
    onSuccess: ({ campaign: value }) => commitCampaign(value),
  });
  const updateBox = useMutation({
    mutationFn: ({ id, boxId, input }: { id: string; boxId: string; input: AdminRewardBoxUpdateInput }) => updateAdminRewardBox(id, boxId, input),
    onSuccess: ({ campaign: value }) => commitCampaign(value),
  });
  const deleteBox = useMutation({
    mutationFn: ({ id, boxId, revision }: { id: string; boxId: string; revision: number }) => deleteAdminRewardBox(id, boxId, revision),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ADMIN_REWARD_QUERY_KEYS.CAMPAIGN(variables.id) }),
        client.invalidateQueries({ queryKey: ADMIN_REWARD_QUERY_KEYS.CAMPAIGNS }),
      ]);
    },
  });
  return { settings, createCampaign, campaign, pool, createBox, updateBox, deleteBox };
}

export type { AdminWelcomeRewardSettings };
