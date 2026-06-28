import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionFromHeaders } from "@/lib/auth";

/**
 * Server-side layout guard for all customer-protected pages
 * (/orders, /history, /profile, ...).
 *
 * Reads user identity from middleware-injected headers instead of
 * doing its own cookie/session resolution. This eliminates the
 * double-rotation bug where both middleware and layout would rotate
 * the same session within a single request cycle.
 */
export default async function CustomerLayout({ children }: { children: ReactNode }) {
  const session = await getSessionFromHeaders();

  if (!session || session.role !== "CUSTOMER") {
    redirect("/");
  }

  return <>{children}</>;
}
