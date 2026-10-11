"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/src/lib/store/authStore";
import { clearPrivateQueryCaches } from "@/src/lib/queryClient";
import type { AccountAuthResult } from "@/contracts/account";
/** Replace UI identity and discard private caches after the server canonicalizes an account. */
export function useAccountSession() {
  const queryClient = useQueryClient();
  const login = useAuthStore((state) => state.login);
  return (result: AccountAuthResult) => {
    clearPrivateQueryCaches(queryClient);
    login(result.phone_number, result.name, result.qr_token);
  };
}
