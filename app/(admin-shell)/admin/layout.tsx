import type { ReactNode } from "react";
import { getSessionOrRefresh } from "@/lib/auth";
import { redirect } from "next/navigation";

/** Ensures that only users with the ADMIN role can access /admin routes. */
export default async function AdminOnlyLayout({ children }: { children: ReactNode }) {
  const session = await getSessionOrRefresh();
  
  // Outer layout handles unauthenticated and non-staff/admin users.
  // Here we only need to restrict STAFF users from entering ADMIN pages.
  if (session && session.role === "STAFF") {
    redirect("/staff/orders");
  }

  return <>{children}</>;
}
