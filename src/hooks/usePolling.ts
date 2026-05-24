import { useState, useEffect, useCallback, useRef } from "react";

export interface UsePollingOptions<T> {
  fetcher: (since?: string) => Promise<T>;
  interval: number;
  enabled?: boolean;
  dependencies?: any[];
}

export interface UsePollingResult<T> {
  data: T | null;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function usePolling<T>({
  fetcher,
  interval,
  enabled = true,
  dependencies = [],
}: UsePollingOptions<T>): UsePollingResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Keep references to latest props and state to avoid stale closures in setInterval
  const fetcherRef = useRef(fetcher);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    fetcherRef.current = fetcher;
    enabledRef.current = enabled;
  }, [fetcher, enabled]);

  const loadData = useCallback(async (isBackground: boolean) => {
    if (!enabledRef.current) return;
    
    if (isBackground) {
      setIsRefreshing(true);
    } else {
      setIsInitialLoading(true);
      setError(null);
    }

    try {
      const result = await fetcherRef.current();
      setData(result);
      if (!isBackground) {
        setError(null);
      }
    } catch (err) {
      console.error("Polling error:", err);
      if (!isBackground) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (isBackground) {
        setIsRefreshing(false);
      } else {
        setIsInitialLoading(false);
      }
    }
  }, []);

  // Initial load and dependency changes
  useEffect(() => {
    if (enabled) {
      loadData(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, enabled, loadData]);

  // Background polling interval
  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      // Pause polling if the document is hidden (user switched tabs)
      if (document.hidden) return;
      loadData(true);
    };

    const id = setInterval(tick, interval);

    // Page Visibility API - fetch immediately when tab becomes visible again
    const handleVisibilityChange = () => {
      if (!document.hidden && enabledRef.current) {
        loadData(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [interval, enabled, loadData]);

  const refetch = useCallback(async () => {
    if (enabledRef.current) {
      await loadData(true); // Refetch acts like a background refresh (no skeleton)
    }
  }, [loadData]);

  return {
    data,
    isInitialLoading,
    isRefreshing,
    error,
    refetch,
  };
}
