import type { ReactNode } from "react";
import AdminTabBar from "@/src/components/admin/AdminTabBar";
import type { Role } from "@/src/lib/types/user";
import { getSessionOrRefresh } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PushSubscriptionManager from "@/src/components/admin/PushSubscriptionManager";

/** Layout shell for all admin and staff pages — top bar + bottom tab bar. */
export default async function AdminShellLayout({ children }: { children: ReactNode }) {
  const session = await getSessionOrRefresh();

  if (!session || (session.role !== "ADMIN" && session.role !== "STAFF")) {
    redirect("/?auth=login");
  }

  // Fetch the actual user name from the database
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { name: true },
  });

  const userName = user?.name || session.phone_number;
  const userRole = session.role as Role;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <AdminTabBar userName={userName} userRole={userRole}>
        <main className="flex-1 px-4 md:px-8 pt-6 pb-20 md:pb-6 max-w-7xl mx-auto w-full">{children}</main>
      </AdminTabBar>
      <PushSubscriptionManager />
    </div>
  );
}
