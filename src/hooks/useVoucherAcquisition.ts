import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { VOUCHER_QUERY_KEYS } from "@/src/constants/voucherQueryKeys";
import {
  claimFreeVoucher,
  exchangeVoucher,
  listMyVouchers,
  type AcquiredVoucher,
  type MyVoucher,
  type VoucherPackage,
} from "@/src/services/customerVoucherService";
import {
  createVoucherAcquisitionCoordinator,
  type VoucherAcquisitionReceipt,
} from "@/src/lib/utils/voucherAcquisitionState";

export type { VoucherAcquisitionStatus } from "@/src/lib/utils/voucherAcquisitionState";

export interface VoucherAcquisitionOptions {
  /** Refreshes the caller's wallet state after a successful claim or exchange. */
  refreshWallet?: () => Promise<MyVoucher[]>;
  /** Optional caller-owned acquisition adapters, used by staff customer wallets. */
  claimFreeVoucher?: (packageId: string) => Promise<AcquiredVoucher>;
  exchangeVoucher?: (packageId: string) => Promise<AcquiredVoucher>;
  refreshCatalog?: () => Promise<void>;
}

/** Acquire once, then refresh the wallet without repeating the exchange on retry. */
export function useVoucherAcquisition(options: VoucherAcquisitionOptions = {}) {
  const queryClient = useQueryClient();
  const defaultRefreshWallet = useCallback(() => queryClient.fetchQuery({
    queryKey: VOUCHER_QUERY_KEYS.CUSTOMER_VOUCHERS,
    queryFn: listMyVouchers,
  }), [queryClient]);
  const coordinator = useMemo(() => createVoucherAcquisitionCoordinator({
    claimFreeVoucher: options.claimFreeVoucher ?? claimFreeVoucher,
    exchangeVoucher: options.exchangeVoucher ?? (async (packageId: string) => ({
      ...(await exchangeVoucher(packageId)),
      already_granted: false,
    })),
    refreshWallet: options.refreshWallet ?? defaultRefreshWallet,
    refreshCatalog: options.refreshCatalog ?? (async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: VOUCHER_QUERY_KEYS.VOUCHER_PACKAGES }),
        queryClient.invalidateQueries({ queryKey: VOUCHER_QUERY_KEYS.CUSTOMER_POINTS }),
      ]);
    }),
  }), [defaultRefreshWallet, options.claimFreeVoucher, options.exchangeVoucher, options.refreshCatalog, options.refreshWallet, queryClient]);

  const receipt = useSyncExternalStore(coordinator.subscribe, coordinator.getReceipt, coordinator.getReceipt);
  const { status, error } = useSyncExternalStore(
    coordinator.subscribeState,
    coordinator.getSnapshot,
    coordinator.getSnapshot,
  );
  const acquire = useCallback(
    (pkg: Pick<VoucherPackage, "id" | "acquisition_mode">) => coordinator.acquire(pkg),
    [coordinator],
  );

  const retryRefresh = useCallback(
    (): Promise<VoucherAcquisitionReceipt | null> => coordinator.retryRefresh(),
    [coordinator],
  );

  return {
    acquire,
    retryRefresh,
    receipt,
    acquiredVoucher: receipt?.acquired ?? null,
    refreshError: receipt?.refreshError ?? null,
    refreshFailed: receipt?.refreshError !== null && receipt?.refreshError !== undefined,
    status,
    error,
    isPending: status === "PENDING",
  };
}
