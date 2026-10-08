"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FusionPowderReplacement, FusionPowderReplacementDetails } from "@/contracts/admin/catalog";
import { VOUCHER_QUERY_KEYS } from "@/src/constants/voucherQueryKeys";
import { ApiServiceError } from "@/src/lib/api/serviceError";

type Operation = (replacements?: FusionPowderReplacement[]) => Promise<void>;
function replacementDetails(error: unknown): FusionPowderReplacementDetails | null {
  if (!(error instanceof ApiServiceError) || error.status !== 422 || error.code !== "BUSINESS_RULE_VIOLATION") return null;
  const details = error.details as Partial<FusionPowderReplacementDetails> | undefined;
  return details?.reason === "FUSION_POWDER_REPLACEMENT_REQUIRED" && Array.isArray(details.fusion_items) && Array.isArray(details.available_powders)
    ? details as FusionPowderReplacementDetails : null;
}

/** Retain a catalog mutation while the admin supplies server-required Fusion replacements. */
export function useFusionPowderReplacement() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<{ operation: Operation; details: FusionPowderReplacementDetails } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: ({ operation, replacements }: { operation: Operation; replacements?: FusionPowderReplacement[] }) => operation(replacements),
    onSuccess: () => {
      for (const queryKey of [
        ["admin", "menu"], ["admin", "powders"], ["menu"], ["powders"],
        ["staff", "menu"], ["staff", "powders"], ["staff", "cart-customer-vouchers"], ["staff", "voucherPackages"],
        VOUCHER_QUERY_KEYS.CUSTOMER_VOUCHERS, VOUCHER_QUERY_KEYS.VOUCHER_PACKAGES, VOUCHER_QUERY_KEYS.ADMIN_VOUCHER_PACKAGES,
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
  const run = async (operation: Operation) => {
    setError(null);
    try { await mutation.mutateAsync({ operation }); }
    catch (failure: unknown) {
      const details = replacementDetails(failure);
      if (!details) throw failure;
      setPending({ operation, details });
    }
  };
  const confirm = async (replacements: FusionPowderReplacement[]) => {
    if (!pending) return;
    setError(null);
    try {
      await mutation.mutateAsync({ operation: pending.operation, replacements });
      setPending(null);
    } catch (failure: unknown) {
      const details = replacementDetails(failure);
      if (details) {
        setPending({ operation: pending.operation, details });
        setError("Danh sách bột hoặc món đã thay đổi. Kiểm tra các lựa chọn được đánh dấu rồi thử lại.");
      } else setError(failure instanceof Error ? failure.message : "Không thể lưu. Vui lòng thử lại.");
    }
  };
  return { pending, run, confirm, error, busy: mutation.isPending, cancel: () => { if (!mutation.isPending) { setPending(null); setError(null); } } };
}
