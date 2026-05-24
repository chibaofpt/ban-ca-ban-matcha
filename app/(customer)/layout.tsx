import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

/**
 * Server-side layout guard for all customer-protected pages
 * (/orders, /history, /profile, ...).
 *
 * Middleware handles silent token rotation.
 */
export default async function CustomerLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!session || session.role !== "CUSTOMER") {
    // Not authenticated or wrong role — send to home page.
    // The AuthModal can be opened client-side if needed.
    redirect("/");
  }

  return <>{children}</>;
}
