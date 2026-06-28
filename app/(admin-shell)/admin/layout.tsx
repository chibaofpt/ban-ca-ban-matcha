import type { ReactNode } from "react";
import { getSessionFromHeaders } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Ensures that only users with the ADMIN role can access /admin routes.
 * Reads user identity from middleware-injected headers (no double-rotation).
 *
 * The outer (admin-shell) layout handles unauthenticated and non-staff/admin users.
 * Here we only restrict STAFF users from entering ADMIN pages.
 */
export default async function AdminOnlyLayout({ children }: { children: ReactNode }) {
  const session = await getSessionFromHeaders();

  // Outer layout handles unauthenticated and non-staff/admin users.
  // Here we only need to restrict STAFF users from entering ADMIN pages.
  if (session && session.role === "STAFF") {
    redirect("/staff/orders");
  }

  return <>{children}</>;
}
