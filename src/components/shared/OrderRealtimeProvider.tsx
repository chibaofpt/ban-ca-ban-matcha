"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeToOrderChanges } from "@/src/services/orderRealtimeService";

const OrderRealtimeContext = createContext(false);

/** Own the operator channel lifecycle and coalesce signals into authorized API refreshes. */
export function OrderRealtimeProvider({ children, userRole }: { children: ReactNode; userRole: string }) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let stopped = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshOrders = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        if (stopped) return;
        void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
        void queryClient.invalidateQueries({ queryKey: ["staff", "orders"] });
      }, 200);
    };
    const subscription = subscribeToOrderChanges(refreshOrders, (value) => {
      if (!stopped) setConnected(value);
    });
    const catchUp = () => {
      if (document.visibilityState === "visible") {
        void subscription.refresh();
        refreshOrders();
      }
    };
    document.addEventListener("visibilitychange", catchUp);
    window.addEventListener("online", catchUp);
    return () => {
      stopped = true;
      clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", catchUp);
      window.removeEventListener("online", catchUp);
      subscription.close();
    };
  }, [queryClient, userRole]);

  return <OrderRealtimeContext.Provider value={connected}>{children}</OrderRealtimeContext.Provider>;
}

/** Read connection health so order queries retain polling only as recovery and safety refresh. */
export function useOrderRealtime() {
  return useContext(OrderRealtimeContext);
}

