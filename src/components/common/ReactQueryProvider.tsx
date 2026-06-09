"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { getQueryClient } from "@/src/lib/queryClient";
import type { ReactNode } from "react";

/**
 * Client-side provider cho TanStack Query.
 * Wrap quanh toàn bộ app trong root layout.
 */
export default function ReactQueryProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
