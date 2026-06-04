"use client";

import { useEffect, useState } from "react";
import { checkAndResubscribe, subscribeToPush, unsubscribeFromPush } from "@/src/services/pushService";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function PushSubscriptionManager() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setLoading(false);
      return;
    }

    setPermission(Notification.permission);

    // Auto check and resubscribe if needed (silent)
    checkAndResubscribe()
      .then((subbed) => {
        setIsSubscribed(subbed);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (isSubscribed) {
        await unsubscribeFromPush();
        setIsSubscribed(false);
        toast.success("Đã tắt thông báo đơn hàng");
      } else {
        await subscribeToPush();
        setPermission(Notification.permission);
        setIsSubscribed(true);
        toast.success("Đã bật thông báo đơn hàng");
      }
    } catch (err: any) {
      console.error(err);
      if (Notification.permission === "denied") {
        setPermission("denied");
        toast.error("Vui lòng cấp quyền thông báo trong cài đặt thiết bị");
      } else {
        toast.error(err.message || "Không thể thay đổi cài đặt thông báo");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return null; // Not supported
  }

  // Floating button at bottom left (above mobile tab bar)
  return (
    <div className="fixed bottom-24 md:bottom-8 left-4 z-50">
      <button
        onClick={handleToggle}
        disabled={loading || permission === "denied"}
        className={`flex items-center gap-2 px-3 py-2 rounded-full shadow-lg transition-colors duration-200 ${
          isSubscribed
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : permission === "denied"
            ? "bg-destructive text-destructive-foreground cursor-not-allowed opacity-80"
            : "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border"
        }`}
        title={isSubscribed ? "Tắt thông báo" : "Bật thông báo"}
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : isSubscribed ? (
          <Bell className="w-5 h-5" />
        ) : (
          <BellOff className="w-5 h-5" />
        )}
        <span className="hidden md:inline text-sm font-medium">
          {isSubscribed ? "Đã bật thông báo" : permission === "denied" ? "Đã chặn thông báo" : "Bật thông báo"}
        </span>
      </button>
    </div>
  );
}
