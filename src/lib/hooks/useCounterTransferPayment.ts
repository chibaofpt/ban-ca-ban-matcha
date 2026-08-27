"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PaymentMethod, StaffOrderResult } from "@/src/lib/types/order";
import {
  collectPendingCounterTransfers,
  type CounterTransferOrderSummary,
} from "@/src/lib/utils/counterTransferOrder";

type CounterTransferStatus = "COMPLETED" | "CANCELLED";

interface CounterTransferListActionOptions {
  updateStatus: (
    orderId: string,
    status: CounterTransferStatus,
  ) => Promise<StaffOrderResult>;
  onChanged: () => void;
}

interface CounterTransferListActionController {
  isProcessing: boolean;
  confirm: (orderId: string) => Promise<void>;
  cancel: (orderId: string) => Promise<void>;
}

/** Provide pending counter-transfer actions with consistent feedback and refresh behavior. */
export function useCounterTransferListAction({
  updateStatus,
  onChanged,
}: CounterTransferListActionOptions): CounterTransferListActionController {
  const mutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: CounterTransferStatus }) =>
      updateStatus(orderId, status),
    onSuccess: (_order, variables) => {
      toast.success(
        variables.status === "COMPLETED" ? "Đã xác nhận thanh toán" : "Đã huỷ giao dịch",
      );
      onChanged();
    },
    onError: () => toast.error("Không thể cập nhật giao dịch"),
  });

  return {
    isProcessing: mutation.isPending,
    confirm: (orderId) =>
      mutation.mutateAsync({ orderId, status: "COMPLETED" }).then(() => undefined),
    cancel: (orderId) =>
      mutation.mutateAsync({ orderId, status: "CANCELLED" }).then(() => undefined),
  };
}

interface PendingCounterTransfersResponse {
  data: CounterTransferOrderSummary[];
}

interface PendingCounterTransfersOptions {
  fetchOrders: () => Promise<PendingCounterTransfersResponse>;
  updateStatus: (
    orderId: string,
    status: CounterTransferStatus,
  ) => Promise<StaffOrderResult>;
}

interface PendingCounterTransfersController {
  payments: StaffOrderResult[];
  activePayment: StaffOrderResult | null;
  isProcessing: boolean;
  selectPayment: (payment: StaffOrderResult) => void;
  selectPaymentAfterSurfaceClose: (payment: StaffOrderResult) => void;
  closePayment: () => void;
  confirm: () => void;
  cancel: () => void;
}

/** Fetch, reopen, and mutate all current-user pending counter transfers. */
export function usePendingCounterTransfers({
  fetchOrders,
  updateStatus,
}: PendingCounterTransfersOptions): PendingCounterTransfersController {
  const queryClient = useQueryClient();
  const [activePayment, setActivePayment] = useState<StaffOrderResult | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const query = useQuery({
    queryKey: ["staff", "orders", "pending-counter-transfers"],
    queryFn: fetchOrders,
    refetchInterval: 30_000,
  });
  const payments = useMemo(
    () => collectPendingCounterTransfers(query.data?.data ?? []),
    [query.data],
  );

  useEffect(() => () => {
    if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
  }, []);

  const action = useCounterTransferListAction({
    updateStatus,
    onChanged: () => {
      queryClient.invalidateQueries({ queryKey: ["staff", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
  });

  const runAction = async (mutation: (orderId: string) => Promise<void>): Promise<void> => {
    if (!activePayment) return;
    try {
      await mutation(activePayment.id);
      setActivePayment(null);
    } catch {
      // The mutation owns feedback; keep the QR open so the user can retry.
    }
  };

  return {
    payments,
    activePayment,
    isProcessing: action.isProcessing,
    selectPayment: setActivePayment,
    selectPaymentAfterSurfaceClose: (payment) => {
      if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
      openTimerRef.current = window.setTimeout(() => {
        setActivePayment(payment);
        openTimerRef.current = null;
      }, 250);
    },
    closePayment: () => setActivePayment(null),
    confirm: () => void runAction(action.confirm),
    cancel: () => void runAction(action.cancel),
  };
}

interface StaffCounterCheckoutPaymentOptions {
  onCheckoutCompleted: () => void;
  onPendingCreated: (order: StaffOrderResult) => void;
}

interface StaffCounterCheckoutPaymentController {
  paymentMethod: PaymentMethod;
  setPaymentMethod: (method: PaymentMethod) => void;
  handleOrderCreated: (order: StaffOrderResult) => void;
}

/** Branch staff checkout between immediate cash completion and a detached pending transfer. */
export function useStaffCounterCheckoutPayment({
  onCheckoutCompleted,
  onPendingCreated,
}: StaffCounterCheckoutPaymentOptions): StaffCounterCheckoutPaymentController {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");

  return {
    paymentMethod,
    setPaymentMethod,
    handleOrderCreated: (order) => {
      setPaymentMethod("CASH");
      if (order.payment_method === "BANK_TRANSFER" && order.status === "PENDING") {
        onPendingCreated(order);
        toast.success("Đã tạo QR chuyển khoản. Bạn có thể mở lại từ nút Chờ CK.");
        return;
      }
      onCheckoutCompleted();
    },
  };
}
