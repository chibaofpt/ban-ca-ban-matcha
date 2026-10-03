import { QueryClient } from "@tanstack/react-query";

/**
 * Singleton QueryClient với config mặc định.
 * - retry: 1 — fail 1 lần → hiện error ngay (khớp behavior cũ)
 * - staleTime: 30s — data không refetch lại trong vòng 30 giây
 * - refetchInterval: 60s while active — keep store/menu data fresh during an open session
 * - refetchOnWindowFocus: true — reconcile private state after returning to the app
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchInterval: 60_000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
      },
    },
  });
}

export type PrivateQueryScope = "customer" | "staff" | "admin";

const PRIVATE_QUERY_PREFIXES: Record<PrivateQueryScope, readonly (readonly string[])[]> = {
  customer: [["customer"], ["my_vouchers"]],
  staff: [["staff"]],
  admin: [["admin"]],
};

/** Remove role-scoped React Query data while retaining public menu and catalog caches. */
export function clearPrivateQueryCaches(
  queryClient: QueryClient,
  scopes: readonly PrivateQueryScope[] = ["customer", "staff", "admin"],
): void {
  const prefixes = scopes.flatMap((scope) => PRIVATE_QUERY_PREFIXES[scope]);
  queryClient.removeQueries({
    predicate: ({ queryKey }) => prefixes.some((prefix) =>
      prefix.every((part, index) => queryKey[index] === part),
    ),
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
