import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WELCOME_REWARD_QUERY_KEYS } from "@/src/constants/welcomeRewardQueryKeys";
import { VOUCHER_QUERY_KEYS } from "@/src/constants/voucherQueryKeys";
import { useIsLoggedInSynced } from "@/src/lib/store/authStore";
import { ApiServiceError } from "@/src/services/orderService";
import {
  getWelcomeReward,
  openWelcomeReward,
  type OpenWelcomeRewardPayload,
  type WelcomeReward,
} from "@/src/services/welcomeRewardService";

/** Read and open the current customer's welcome reward with private cache ownership. */
export function useWelcomeReward(options?: { enabled?: boolean; initialData?: WelcomeReward | null }) {
  const queryClient = useQueryClient();
  const isLoggedInSynced = useIsLoggedInSynced();
  const query = useQuery({
    queryKey: WELCOME_REWARD_QUERY_KEYS.CUSTOMER,
    queryFn: getWelcomeReward,
    enabled: isLoggedInSynced && (options?.enabled ?? true),
    initialData: options?.initialData,
  });

  const openMutation = useMutation({
    mutationFn: async (payload: OpenWelcomeRewardPayload) => {
      try {
        return await openWelcomeReward(payload);
      } catch (error: unknown) {
        if (error instanceof ApiServiceError) throw error;
        const reconciled = await queryClient.fetchQuery({
          queryKey: WELCOME_REWARD_QUERY_KEYS.CUSTOMER,
          queryFn: getWelcomeReward,
          staleTime: 0,
        });
        if (reconciled?.status === "COMPLETED") return reconciled;
        throw error;
      }
    },
    onSuccess: (reward) => {
      queryClient.setQueryData(WELCOME_REWARD_QUERY_KEYS.CUSTOMER, reward);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer", "profile"] }),
        queryClient.invalidateQueries({ queryKey: VOUCHER_QUERY_KEYS.CUSTOMER_POINTS }),
        queryClient.invalidateQueries({ queryKey: VOUCHER_QUERY_KEYS.CUSTOMER_VOUCHERS }),
        queryClient.invalidateQueries({ queryKey: VOUCHER_QUERY_KEYS.CUSTOMER_VOUCHER_HISTORY }),
        queryClient.invalidateQueries({ queryKey: VOUCHER_QUERY_KEYS.VOUCHER_PACKAGES }),
      ]);
    },
  });

  return { ...query, openReward: openMutation };
}
