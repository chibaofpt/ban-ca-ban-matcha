"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { onForceLogout } from "@/src/lib/api/client";
import { useAuthStore } from "@/src/lib/store/authStore";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";

/** Customer-protected path prefixes that should redirect to home + open login modal. */
const CUSTOMER_PROTECTED_PATHS = ["/orders", "/history", "/profile"];

/**
 * AuthGuardProvider — Client-side wrapper that listens for force-logout
 * events fired by the Axios interceptor when the refresh token is also dead.
 *
 * Mount this once in the root layout so it covers all routes.
 * Behaviour on force-logout:
 *   - Clears authStore (localStorage)
 *   - Shows a toast notification
 *   - Admin/staff paths  → redirect to /admin/login
 *   - Customer paths     → redirect to / and open the login modal
 *   - Public paths       → clear state silently, no redirect
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
      // Avoids spurious redirects on public pages with no active session.
      if (!user) return;

      // 1. Clear client-side auth state (localStorage)
      logout();

      // 2. Edge Case 3: inform user why they were logged out
      toast.error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");

      // 3. Redirect based on current path
      if (pathname.startsWith("/admin") || pathname.startsWith("/staff")) {
        // Admin / staff — send to dedicated login page
        router.replace("/admin/login");
      } else if (CUSTOMER_PROTECTED_PATHS.some((p) => pathname.startsWith(p))) {
        // Customer protected page — go home then open login modal
        router.replace("/");
        // Small delay to allow navigation to complete before opening modal
        setTimeout(() => openLogin(), 300);
      }
      // Public pages (/, /menu, etc.) — silently cleared, no redirect needed
    });
  // Re-register whenever pathname or user changes so the closure stays current.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, user]);

  return <>{children}</>;
}
