"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/src/lib/api/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, Clock, AlertTriangle, ArrowRight, Ticket } from "lucide-react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/src/components/staff/StatusBadge";
import type { OrderStatus } from "@prisma/client";

interface CustomerHistoryOrder {
  id: string;
  order_code: string | null;
  status: OrderStatus;
  order_type: string;
  total_vnd: number;
  created_at: string;
  items: Array<{
    quantity: number;
    menuItem: { name: string };
  }>;
}

export default function HistoryPage() {
  const [activeTab, setActiveTab] = useState<"orders" | "vouchers">("orders");
  const [orders, setOrders] = useState<CustomerHistoryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (activeTab === "orders") {
      fetchOrders();
    }
  }, [activeTab]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/api/orders");
      setOrders(res.data.data);
    } catch (err) {
      toast.error("Không thể tải lịch sử đơn hàng");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())} • ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  };

  return (
    <div className="px-4 py-8 max-w-2xl mx-auto space-y-6 pb-24">
      <h1 className="font-serif text-3xl font-bold text-primary">Lịch sử của tôi</h1>

      {/* Tabs */}
      <div className="flex bg-secondary/30 p-1 rounded-2xl">
        <button
          onClick={() => setActiveTab("orders")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "orders" ? "bg-white shadow-sm text-primary" : "text-primary/60 hover:text-primary"
          }`}
        >
          Đơn hàng
        </button>
        <button
          onClick={() => setActiveTab("vouchers")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "vouchers" ? "bg-white shadow-sm text-primary" : "text-primary/60 hover:text-primary"
          }`}
        >
          Voucher
        </button>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "orders" ? (
            <div className="space-y-4">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-32 bg-secondary/40 rounded-3xl animate-pulse" />
                ))
              ) : orders.length === 0 ? (
                <div className="text-center py-20 bg-secondary/20 rounded-3xl border border-border/50">
                  <div className="text-5xl mb-4">🛒</div>
                  <p className="font-bold text-primary">Bạn chưa có đơn hàng nào</p>
                  <p className="text-sm text-primary/60 mt-1">Hãy đặt thử một ly matcha nhé!</p>
                  <button
                    onClick={() => router.push("/menu")}
                    className="mt-4 bg-primary text-white px-6 py-2 rounded-xl font-bold text-sm shadow-md hover:scale-105 transition-transform"
                  >
                    Xem Menu
                  </button>
                </div>
              ) : (
                orders.map((order) => (
                  <div
                    key={order.id}
                    onClick={() => router.push(`/orders/${order.id}`)}
                    className="bg-white border border-border/60 rounded-3xl p-5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-primary">
                            {order.order_code ? order.order_code : `#${order.id.slice(0, 8)}`}
                          </span>
                          <StatusBadge status={order.status} />
                        </div>
                        <p className="text-xs text-primary/50 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" /> {formatDate(order.created_at)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-primary text-lg">
                          {(order.total_vnd / 1000).toLocaleString("vi-VN")}K
                        </p>
                        <p className="text-[11px] text-primary/50 font-medium px-2 py-0.5 bg-primary/5 rounded-lg inline-block mt-1 uppercase tracking-wider">
                          {order.order_type === "PICKUP" ? "Lấy tại quán" : order.order_type}
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-border/50 pt-3 flex items-center justify-between">
                      <p className="text-sm text-primary/70 line-clamp-1">
                        {order.items.map((i) => `${i.quantity}x ${i.menuItem.name}`).join(", ")}
                      </p>
                      <ArrowRight className="w-4 h-4 text-primary/40 group-hover:text-primary transition-colors shrink-0 ml-4" />
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="text-center py-24 bg-secondary/20 rounded-3xl border border-border/50 flex flex-col items-center justify-center">
              <Ticket className="w-12 h-12 text-primary/30 mb-4" />
              <p className="font-bold text-primary text-lg">Tính năng đang phát triển</p>
              <p className="text-sm text-primary/60 mt-1 max-w-[250px]">
                Tính năng theo dõi voucher đã đổi sẽ sớm ra mắt trong Phase 4!
              </p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
