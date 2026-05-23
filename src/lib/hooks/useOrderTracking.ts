"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchOrderDetail } from "@/src/services/orderService";
import type { CustomerOrderDetail, OrderStatus } from "@/src/lib/types/order";

/** Terminal statuses — polling stops when reached. */
const TERMINAL_STATUSES: OrderStatus[] = ["COMPLETED", "CANCELLED"];

/** Adaptive polling intervals in milliseconds per status. */
const POLL_INTERVAL: Record<OrderStatus, number> = {
  PENDING: 30_000,        // Waiting for admin — check every 30s
  ADMIN_CONFIRMED: 10_000, // Staff is making it — check every 10s
  STAFF_DONE: 15_000,     // Waiting for pickup — check every 15s
  COMPLETED: 0,           // Terminal — no polling
  CANCELLED: 0,           // Terminal — no polling
};

interface UseOrderTrackingResult {
  order: CustomerOrderDetail | null;
  loading: boolean;
  error: string | null;
}

/**
 * Smart polling hook for customer order tracking.
 * - Adaptive interval based on current order status.
 * - Pauses polling when the browser tab is hidden; resumes + re-fetches on focus.
 * - Stops polling once order reaches a terminal status.
 * - Cleans up interval and event listeners on unmount.
 */
export function useOrderTracking(orderId: string): UseOrderTrackingResult {
  const [order, setOrder] = useState<CustomerOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use refs to avoid stale closures in interval callbacks
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const orderRef = useRef<CustomerOrderDetail | null>(null);
  const isPausedRef = useRef(false);

  const clearPoll = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const fetchAndUpdate = useCallback(async () => {
    try {
      const data = await fetchOrderDetail(orderId);
      setOrder(data);
      setError(null);
      orderRef.current = data;
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể tải trạng thái đơn hàng";
      setError(message);
      return null;
    }
  }, [orderId]);

  const startPolling = useCallback(
    (status: OrderStatus) => {
      clearPoll();

      // Do not start polling for terminal statuses
      if (TERMINAL_STATUSES.includes(status)) return;

      const interval = POLL_INTERVAL[status];
      if (interval <= 0) return;

      intervalRef.current = setInterval(async () => {
        // Skip fetch if tab is hidden
        if (isPausedRef.current) return;

        const data = await fetchAndUpdate();
        if (!data) return;

        // Re-schedule with updated interval if status changed
        const newInterval = POLL_INTERVAL[data.status];
        const currentInterval = POLL_INTERVAL[status];

        if (TERMINAL_STATUSES.includes(data.status)) {
          clearPoll();
        } else if (newInterval !== currentInterval) {
          startPolling(data.status);
        }
      }, interval);
    },
    [clearPoll, fetchAndUpdate]
  );

  // Initial fetch + start polling
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setLoading(true);
      const data = await fetchAndUpdate();
      if (!mounted) return;
      setLoading(false);
      if (data && !TERMINAL_STATUSES.includes(data.status)) {
        startPolling(data.status);
      }
    };

    init();

    // Pause on tab hidden, resume + re-fetch on tab visible
    const handleVisibility = async () => {
      if (document.hidden) {
        isPausedRef.current = true;
      } else {
        isPausedRef.current = false;
        // Immediate fetch on tab focus
        const data = await fetchAndUpdate();
        if (!mounted || !data) return;
        if (TERMINAL_STATUSES.includes(data.status)) {
          clearPoll();
        } else {
          startPolling(data.status);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mounted = false;
      clearPoll();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [orderId, clearPoll, fetchAndUpdate, startPolling]);

  return { order, loading, error };
}
