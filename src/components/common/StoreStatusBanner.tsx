"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getStoreStatus } from "@/src/services/storeStatusService";
import { useStoreStatusStore } from "@/src/lib/store/storeStore";

/** Build human-readable banner message from store status. */
function buildBannerMessage(
  reason: string,
  closure_note: string | null,
  today_open_time?: string,
  today_close_time?: string,
): string {
  if (reason === "TEMPORARY_CLOSURE") {
    return closure_note
      ? `🔴 Cửa hàng tạm nghỉ — ${closure_note}`
      : "🔴 Cửa hàng tạm nghỉ, vui lòng quay lại sau!";
  }
  if (reason === "OUTSIDE_HOURS") {
    if (today_open_time && today_close_time) {
      return `⏰ Cửa hàng ngoài giờ mở cửa. Hôm nay mở từ ${today_open_time} đến ${today_close_time}`;
    }
    return "⏰ Cửa hàng hiện ngoài giờ mở cửa";
  }
  if (reason === "DAY_OFF") {
    return "📅 Hôm nay cửa hàng nghỉ";
  }
  return "";
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
  if (!showBanner) return null;

  const bannerMessage = reason
    ? buildBannerMessage(reason, closure_note, todayFirstOpen, todayLastClose)
    : "";

  return (
    <div
      id="store-closed-banner"
      className="relative z-40 px-4 py-3 text-center text-sm font-medium bg-amber-500/90 text-amber-950 flex items-center justify-center gap-3"
    >
      <span>{bannerMessage}</span>
      <button
        onClick={() => setBannerDismissed(true)}
        className="shrink-0 opacity-70 hover:opacity-100 transition"
        aria-label="Đóng thông báo"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
