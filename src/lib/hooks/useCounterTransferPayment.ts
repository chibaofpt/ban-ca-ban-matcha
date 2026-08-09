"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useStaffCartStore } from "@/src/lib/store/staffCartStore";
import type { PaymentMethod, StaffOrderResult } from "@/src/lib/types/order";

type CounterTransferStatus = "COMPLETED" | "CANCELLED";

interface PendingPaymentRecoveryOptions {
  orderId: string | undefined;
  getOrder: (orderId: string) => Promise<StaffOrderResult>;
  onPending: (order: StaffOrderResult) => void;
  onCompleted: () => void;
  onCancelled: () => void;
}

/** Reconcile a persisted pending counter payment with its server-authoritative status. */
export function usePendingCounterPaymentRecovery({
  orderId,
  getOrder,
  onPending,
  onCompleted,
  onCancelled,
}: PendingPaymentRecoveryOptions): void {
  useEffect(() => {
    if (!orderId) return;
    let active = true;
    getOrder(orderId)
      .then((order) => {
        if (!active) return;
        if (order.status === "PENDING") onPending(order);
        if (order.status === "COMPLETED") onCompleted();
        if (order.status === "CANCELLED") onCancelled();
      })
      .catch(() => {
        // Retain the local snapshot; the next status mutation remains server-authoritative.
      });
    return () => {
      active = false;
    };
  }, [getOrder, onCancelled, onCompleted, onPending, orderId]);
}

interface CounterTransferStatusOptions {
  updateStatus: (
    orderId: string,
    status: CounterTransferStatus,
  ) => Promise<StaffOrderResult>;
  onCompleted: (order: StaffOrderResult) => void;
  onCancelled: (order: StaffOrderResult) => void;
  onSuccess: () => void;
  onError: (error: unknown) => void;
}

interface CounterTransferStatusController {
  isProcessing: boolean;
  confirm: (orderId: string) => void;
  cancel: (orderId: string) => void;
}

/** Own the async confirmation/cancellation mutation for a pending counter transfer. */
export function useCounterTransferStatus({
  updateStatus,
  onCompleted,
  onCancelled,
  onSuccess,
  onError,
}: CounterTransferStatusOptions): CounterTransferStatusController {
  const mutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: CounterTransferStatus }) =>
      updateStatus(orderId, status),
    onSuccess: (order, variables) => {
      if (variables.status === "COMPLETED") onCompleted(order);
      else onCancelled(order);
      onSuccess();
    },
    onError,
  });

  return {
    isProcessing: mutation.isPending,
    confirm: (orderId: string) => mutation.mutate({ orderId, status: "COMPLETED" }),
    cancel: (orderId: string) => mutation.mutate({ orderId, status: "CANCELLED" }),
  };
}

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

/** Provide list-row counter-transfer actions with consistent feedback and refresh behavior. */
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

interface StaffCounterCheckoutPaymentOptions {
  getOrder: (orderId: string) => Promise<StaffOrderResult>;
  updateStatus: (
    orderId: string,
    status: CounterTransferStatus,
  ) => Promise<StaffOrderResult>;
  onCheckoutCompleted: () => void;
  onOrdersChanged: () => void;
}

interface StaffCounterCheckoutPaymentController {
  paymentMethod: PaymentMethod;
  setPaymentMethod: (method: PaymentMethod) => void;
  pendingPayment: StaffOrderResult | null;
  isProcessing: boolean;
  handleOrderCreated: (order: StaffOrderResult) => void;
  confirm: () => void;
  cancel: () => void;
}

/** Compose persisted recovery, creation branching, and status actions for counter checkout. */
export function useStaffCounterCheckoutPayment({
  getOrder,
  updateStatus,
  onCheckoutCompleted,
  onOrdersChanged,
}: StaffCounterCheckoutPaymentOptions): StaffCounterCheckoutPaymentController {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const pendingPayment = useStaffCartStore((state) => state.pendingPayment);
  const setPendingPayment = useStaffCartStore((state) => state.setPendingPayment);
  const clearPendingPayment = useStaffCartStore((state) => state.clearPendingPayment);
  const clearCart = useStaffCartStore((state) => state.clearCart);

  usePendingCounterPaymentRecovery({
    orderId: pendingPayment?.id,
    getOrder,
    onPending: setPendingPayment,
    onCompleted: clearCart,
    onCancelled: clearPendingPayment,
  });

  const status = useCounterTransferStatus({
    updateStatus,
    onCompleted: () => {
      setPaymentMethod("CASH");
      onCheckoutCompleted();
      toast.success("Đã xác nhận thanh toán chuyển khoản.");
    },
    onCancelled: () => {
      clearPendingPayment();
      setPaymentMethod("CASH");
      toast.success("Đã huỷ giao dịch. Giỏ hàng vẫn được giữ nguyên.");
    },
    onSuccess: onOrdersChanged,
    onError: (error: unknown) => {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : null;
      toast.error(message ?? "Không thể cập nhật giao dịch. Vui lòng thử lại.");
    },
  });

  return {
    paymentMethod,
    setPaymentMethod,
    pendingPayment,
    isProcessing: status.isProcessing,
    handleOrderCreated: (order) => {
      if (order.payment_method === "BANK_TRANSFER" && order.status === "PENDING") {
        setPendingPayment(order);
        toast.success("Đã tạo QR chuyển khoản. Vui lòng chờ khách thanh toán.");
        return;
      }
      setPaymentMethod("CASH");
      onCheckoutCompleted();
    },
    confirm: () => {
      if (pendingPayment) status.confirm(pendingPayment.id);
    },
    cancel: () => {
      if (pendingPayment) status.cancel(pendingPayment.id);
    },
  };
}
