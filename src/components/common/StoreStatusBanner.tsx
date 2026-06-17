"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Info, X, AlertTriangle, CalendarDays } from "lucide-react";
import { getStoreStatus } from "@/src/services/storeStatusService";
import { useStoreStatusStore } from "@/src/lib/store/storeStore";

function getBannerConfig(
  reason: string,
  closure_note: string | null,
  today_open_time?: string,
  today_close_time?: string,
) {
  if (reason === "TEMPORARY_CLOSURE") {
    return {
      message: closure_note
        ? `Tạm nghỉ: ${closure_note}`
        : "Cửa hàng đang tạm nghỉ, vui lòng quay lại sau!",
      icon: <AlertTriangle className="w-4 h-4 text-red-500" />,
      colorClass: "bg-red-50/90 border-red-200 text-red-800 dark:bg-red-950/90 dark:border-red-900 dark:text-red-200",
    };
  }
  if (reason === "OUTSIDE_HOURS") {
    if (today_open_time && today_close_time) {
      return {
        message: `Ngoài giờ mở cửa. Hôm nay phục vụ từ ${today_open_time} - ${today_close_time}`,
        icon: <Info className="w-4 h-4 text-amber-500" />,
        colorClass: "bg-amber-50/90 border-amber-200 text-amber-800 dark:bg-amber-950/90 dark:border-amber-900 dark:text-amber-200",
      };
    }
    return {
      message: "Cửa hàng hiện đang ngoài giờ mở cửa",
      icon: <Info className="w-4 h-4 text-amber-500" />,
      colorClass: "bg-amber-50/90 border-amber-200 text-amber-800 dark:bg-amber-950/90 dark:border-amber-900 dark:text-amber-200",
    };
  }
  if (reason === "DAY_OFF") {
    return {
      message: "Hôm nay cửa hàng nghỉ định kỳ",
      icon: <CalendarDays className="w-4 h-4 text-zinc-500" />,
      colorClass: "bg-zinc-50/90 border-zinc-200 text-zinc-800 dark:bg-zinc-900/90 dark:border-zinc-800 dark:text-zinc-200",
    };
  }
  return null;
}

export default function StoreStatusBanner() {
  const pathname = usePathname();
  const { is_open, reason, closure_note, isLoaded, setStoreStatus } = useStoreStatusStore();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [todayFirstOpen, setTodayFirstOpen] = useState<string | undefined>(undefined);
  const [todayLastClose, setTodayLastClose] = useState<string | undefined>(undefined);

  useEffect(() => {
    // Only fetch if not already loaded and not on admin/staff paths
    if (!isLoaded && !pathname.startsWith("/admin") && !pathname.startsWith("/staff")) {
      getStoreStatus()
        .then((data) => {
          setStoreStatus({
            is_open: data.is_open,
            reason: data.reason,
            closure_note: data.closure_note,
          });
          if (data.today_schedule.length > 0) {
            setTodayFirstOpen(data.today_schedule[0].open_time);
            setTodayLastClose(data.today_schedule[data.today_schedule.length - 1].close_time);
          }
        })
        .catch(() => {
          // Silently ignore — store status is non-critical
        });
    }
  }, [isLoaded, setStoreStatus, pathname]);

  // Hide banner on admin or staff routes
  if (pathname.startsWith("/admin") || pathname.startsWith("/staff")) {
    return null;
  }

  const showBanner = isLoaded && !is_open && !bannerDismissed;
  const config = reason
    ? getBannerConfig(reason, closure_note, todayFirstOpen, todayLastClose)
    : null;

  return (
    <AnimatePresence>
      {showBanner && config && (
        <motion.div
          initial={{ y: -20, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -20, opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          id="store-closed-banner"
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-[100] flex items-start gap-3 px-4 py-3 rounded-2xl shadow-lg backdrop-blur-md border border-white/20 w-[92vw] max-w-md ${config.colorClass}`}
        >
          <div className="shrink-0 flex items-center justify-center bg-white/50 rounded-full p-1.5 shadow-sm mt-0.5">
            {config.icon}
          </div>
          <span className="text-sm font-medium pr-2 leading-snug flex-1">
            {config.message}
          </span>
          <button
            onClick={() => setBannerDismissed(true)}
            className="shrink-0 ml-auto p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors mt-0.5"
            aria-label="Đóng thông báo"
          >
            <X className="w-4 h-4 opacity-70" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
