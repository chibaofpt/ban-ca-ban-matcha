"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Gift } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { OrderHistoryTab } from "@/src/components/customer/OrderHistoryTab";
import { PointsHistoryTab } from "@/src/components/customer/PointsHistoryTab";
import ReorderResultSheet from "@/src/components/customer/ReorderResultSheet";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import VoucherModal from "@/src/components/shared/VoucherModal";
import { useCustomerPoints, useCustomerPointsHistory } from "@/src/hooks/useCustomerPoints";
import { useReorderItem } from "@/src/hooks/useReorderItem";
import { useVoucherModalStore } from "@/src/lib/store/voucherModalStore";
import type { CustomerHistoryOrderItem } from "@/src/lib/types/order";
import {
  getHistoryTabHref,
  resolveHistoryTab,
  type HistoryTab,
} from "@/src/lib/utils/historyTab";
import { cancelOrder, fetchCustomerOrders } from "@/src/services/orderService";

/** Customer history page combining order tracking and grouped point transactions. */
export default function HistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const activeTab = resolveHistoryTab(searchParams.get("tab"));
  const openVoucherModal = useVoucherModalStore((state) => state.openModal);
  const { data: points } = useCustomerPoints();
  const [orderPage, setOrderPage] = useState(1);
  const [pointsPage, setPointsPage] = useState(1);
  const [cancelModal, setCancelModal] = useState({
    isOpen: false,
    orderId: "",
  });
  const {
    result: reorderResult,
    reorderItem,
    closeResult,
    openCart,
  } = useReorderItem();

  const fetchOrders = useCallback(
    () => fetchCustomerOrders({ page: orderPage, limit: 10 }),
    [orderPage],
  );
  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ["customer", "orders", { page: orderPage }],
    queryFn: fetchOrders,
    refetchInterval: 15_000,
    enabled: activeTab === "orders",
  });
  const pointsHistory = useCustomerPointsHistory(
    pointsPage,
    10,
    activeTab === "points",
  );

  const orders = ordersData?.data ?? [];
  const totalOrderPages = ordersData?.meta.totalPages ?? 1;
  const orderStatusSignature = orders
    .map((order) => `${order.id}:${order.status}`)
    .join("|");
  const previousOrderStatusSignature = useRef<string | null>(null);

  useEffect(() => {
    if (
      previousOrderStatusSignature.current !== null &&
      previousOrderStatusSignature.current !== orderStatusSignature
    ) {
      queryClient.invalidateQueries({ queryKey: ["customer", "points"] });
    }
    previousOrderStatusSignature.current = orderStatusSignature;
  }, [orderStatusSignature, queryClient]);

  const cancelMutation = useMutation({
    mutationFn: cancelOrder,
    onSuccess: () => {
      toast.success("Đã huỷ đơn hàng", { duration: 3500 });
      queryClient.invalidateQueries({ queryKey: ["customer", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["customer", "points"] });
    },
    onError: () => {
      toast.error("Không thể huỷ đơn hàng. Vui lòng thử lại.", {
        duration: 3500,
      });
    },
  });

  const changeTab = (tab: HistoryTab): void => {
    if (tab === "orders") setOrderPage(1);
    else setPointsPage(1);
    router.replace(getHistoryTabHref(tab), { scroll: false });
  };

  const confirmCancel = (): void => {
    const orderId = cancelModal.orderId;
    setCancelModal({ isOpen: false, orderId: "" });
    cancelMutation.mutate(orderId);
  };

  const reorder = (item: CustomerHistoryOrderItem): void => {
    void reorderItem(item);
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 overflow-x-hidden px-4 py-6 pb-24">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-bold text-primary">Lịch sử</h1>
        <motion.button
          id="voucher-modal-trigger-history"
          type="button"
          whileTap={{ scale: 0.92 }}
          transition={{ duration: 0.18 }}
          onClick={openVoucherModal}
          className="flex min-h-11 items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3.5 text-xs font-bold text-white shadow-sm shadow-orange-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Gift className="h-4 w-4" aria-hidden="true" />
          <span>Đổi quà {typeof points === "number" && `(${points} 🐟)`}</span>
        </motion.button>
      </header>

      <div role="tablist" aria-label="Lịch sử" className="grid grid-cols-2 rounded-2xl bg-secondary/30 p-1">
        {(["orders", "points"] as const).map((tab) => {
          const selected = activeTab === tab;
          return (
            <motion.button
              key={tab}
              type="button"
              role="tab"
              id={`history-tab-${tab}`}
              aria-selected={selected}
              aria-controls={`history-panel-${tab}`}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.18 }}
              onClick={() => changeTab(tab)}
              className={`min-h-11 rounded-xl text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                selected
                  ? "bg-card text-primary shadow-sm"
                  : "text-primary/60 hover:text-primary"
              }`}
            >
              {tab === "orders" ? "Đơn hàng" : "Điểm"}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.section
          key={activeTab}
          role="tabpanel"
          id={`history-panel-${activeTab}`}
          aria-labelledby={`history-tab-${activeTab}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "orders" ? (
            <OrderHistoryTab
              orders={orders}
              isLoading={ordersLoading}
              page={orderPage}
              totalPages={totalOrderPages}
              onPageChange={setOrderPage}
              onCancel={(orderId) => setCancelModal({ isOpen: true, orderId })}
              onReorder={reorder}
            />
          ) : (
            <PointsHistoryTab
              data={pointsHistory.data}
              isLoading={pointsHistory.isLoading}
              isError={pointsHistory.isError}
              onPageChange={setPointsPage}
            />
          )}
        </motion.section>
      </AnimatePresence>

      <ConfirmModal
        isOpen={cancelModal.isOpen}
        title="Huỷ đơn hàng"
        message="Bạn có chắc chắn muốn huỷ đơn này? Hành động này không thể hoàn tác."
        isDestructive
        onConfirm={confirmCancel}
        onCancel={() => setCancelModal({ isOpen: false, orderId: "" })}
      />
      <ReorderResultSheet
        isOpen={reorderResult.isOpen}
        onClose={closeResult}
        onOpenCart={openCart}
        itemName={reorderResult.itemName}
        configSummary={reorderResult.configSummary}
        warnings={reorderResult.warnings}
        isSuccess={reorderResult.isSuccess}
      />
      <VoucherModal />
    </main>
  );
}
