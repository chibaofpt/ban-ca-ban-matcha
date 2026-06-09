import { QueryClient } from "@tanstack/react-query";

/**
 * Singleton QueryClient với config mặc định.
 * - retry: 1 — fail 1 lần → hiện error ngay (khớp behavior cũ)
 * - staleTime: 30s — data không refetch lại trong vòng 30 giây
 * - refetchOnWindowFocus: false — giữ behavior cũ, không tự refetch khi tab focus
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/** Returns a singleton QueryClient for client-side usage. */
export function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: tạo mới mỗi request để tránh shared state
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
