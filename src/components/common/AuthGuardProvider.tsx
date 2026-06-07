"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { onForceLogout } from "@/src/lib/api/client";
import { useAuthStore } from "@/src/lib/store/authStore";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";


/**
 * AuthGuardProvider — Client-side wrapper that listens for force-logout
 * events fired by the Axios interceptor when the refresh token is also dead.
 *
 * Mount this once in the root layout so it covers all routes.
 * Behaviour on force-logout (all roles — CUSTOMER, STAFF, ADMIN):
 *   - Clears authStore (localStorage)
 *   - Shows a toast notification
 *   - Redirects to / and opens the unified login modal
 */
export default function AuthGuardProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const openLogin = useAuthModalStore((s) => s.openLogin);

  useEffect(() => {
    onForceLogout(() => {
      // Only act when the client state indicates a user was logged in.
      if (!user) return;

      // 1. Clear client-side auth state (localStorage)
      logout();

      // 2. Inform user why they were logged out
      toast.error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");

      // 3. All roles → go home and open the shared login modal
      router.replace("/");
      setTimeout(() => openLogin(), 300);
    });
  // Re-register whenever pathname or user changes so the closure stays current.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, user]);

  return <>{children}</>;
}
