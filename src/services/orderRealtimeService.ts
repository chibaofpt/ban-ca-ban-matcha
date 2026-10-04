import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { isAxiosError } from "axios";
import { apiClient } from "@/src/lib/api/client";
import { ApiServiceError } from "@/src/lib/api/serviceError";
import type { ApiError, ApiResponse } from "@/contracts/api";
import type { OrderRealtimeToken } from "@/contracts/realtime";

/** Fetch a fresh capability through the existing cookie-authenticated API client. */
export async function fetchOrderRealtimeToken(): Promise<OrderRealtimeToken> {
  try {
    const response = await apiClient.get<ApiResponse<OrderRealtimeToken>>("/api/realtime/orders/token");
    return response.data.data;
  } catch (error: unknown) {
    if (isAxiosError<ApiError>(error) && error.response &&
        typeof error.response.data?.error === "string" && typeof error.response.data.code === "string") {
      throw new ApiServiceError(error.response.data.error, error.response.status,
        error.response.data.code, error.response.data.details);
    }
    throw error;
  }
}

/** Keep one private order channel alive, renewing capabilities and disposing its exact client. */
export function subscribeToOrderChanges(onChange: () => void, onStatus: (connected: boolean) => void) {
  let client: SupabaseClient | undefined;
  let channel: RealtimeChannel | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let refreshing = false;
  let latestToken = "";

  const disposeConnection = () => {
    const previousClient = client;
    const previousChannel = channel;
    client = undefined;
    channel = undefined;
    if (previousClient && previousChannel) void previousClient.removeChannel(previousChannel);
    previousClient?.realtime.disconnect();
  };
  const schedule = (delay: number) => {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(() => { void refresh(); }, delay);
  };
  const refresh = async () => {
    if (stopped || refreshing) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !publishableKey) {
      onStatus(false);
      return;
    }
    refreshing = true;
    try {
      const capability = await fetchOrderRealtimeToken();
      if (stopped) return;
      latestToken = capability.token;
      client ??= createClient(url, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        accessToken: async () => latestToken,
      });
      const activeClient = client;
      await activeClient.realtime.setAuth(latestToken);
      if (stopped || client !== activeClient) return;
      if (!channel) {
        channel = activeClient.channel(capability.topic, { config: { private: true } })
          .on("broadcast", { event: capability.event }, () => {
            if (!stopped && client === activeClient) onChange();
          })
          .subscribe((status) => {
            if (stopped || client !== activeClient) return;
            onStatus(status === "SUBSCRIBED");
            if (status === "SUBSCRIBED") onChange();
            if (status === "CLOSED") {
              disposeConnection();
              schedule(30_000);
            }
          });
      }
      if (client === activeClient) {
        schedule(Math.max(1000, capability.expires_at * 1000 - Date.now() - 30_000));
      }
    } catch {
      if (!stopped) {
        disposeConnection();
        onStatus(false);
        schedule(30_000);
      }
    } finally {
      refreshing = false;
    }
  };

  void refresh();
  return {
    refresh,
    close: () => {
      stopped = true;
      clearTimeout(timer);
      disposeConnection();
    },
  };
}

