import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { VOUCHER_QUERY_KEYS } from "@/src/constants/voucherQueryKeys";
import {
  claimFreeVoucher,
  exchangeVoucher,
  type AcquiredVoucher,
  type VoucherPackage,
} from "@/src/services/customerVoucherService";

export type VoucherAcquisitionStatus = "IDLE" | "PENDING" | "SUCCESS" | "ERROR";

/** Acquire customer voucher packages through one typed free-or-points workflow. */
export function useVoucherAcquisition() {
  const [status, setStatus] = useState<VoucherAcquisitionStatus>("IDLE");
  const [error, setError] = useState<Error | null>(null);
  const queryClient = useQueryClient();

  /** Acquire a free or points package and refresh all customer voucher data. */
  const acquire = async (
    pkg: Pick<VoucherPackage, "id" | "acquisition_mode">,
  ): Promise<AcquiredVoucher> => {
    setStatus("PENDING");
    setError(null);

    try {
      let result: AcquiredVoucher;
      if (pkg.acquisition_mode === "FREE_CLAIM") {
        result = await claimFreeVoucher(pkg.id);
      } else if (pkg.acquisition_mode === "POINTS_EXCHANGE") {
        result = { ...(await exchangeVoucher(pkg.id)), already_granted: false };
      } else {
        throw new Error(`Unsupported acquisition mode: ${pkg.acquisition_mode}`);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: VOUCHER_QUERY_KEYS.CUSTOMER_VOUCHERS }),
        queryClient.invalidateQueries({ queryKey: VOUCHER_QUERY_KEYS.VOUCHER_PACKAGES }),
        queryClient.invalidateQueries({ queryKey: VOUCHER_QUERY_KEYS.CUSTOMER_POINTS }),
      ]);

      setStatus("SUCCESS");
      
      return result;
    } catch (err) {
      setStatus("ERROR");
      setError(err instanceof Error ? err : new Error("Unknown error"));
      throw err;
    }
  };

  return { acquire, status, error, isPending: status === "PENDING" };
}
