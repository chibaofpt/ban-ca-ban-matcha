"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ClipboardList, Package, Gift, Megaphone, Receipt, Settings, Users } from "lucide-react";
import { cn } from "@/src/utils/cn";
import type { Role } from "@/src/lib/types/user";
import * as authService from "@/src/services/authService";
import { useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import StoreSettingsModal from "@/src/components/admin/StoreSettingsModal";
import { useAuthStore } from "@/src/lib/store/authStore";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAdminOrders } from "@/src/services/adminOrderService";
import { useStaffCartStore } from "@/src/lib/store/staffCartStore";
import { clearPrivateQueryCaches } from "@/src/lib/queryClient";

interface Tab {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  roles: Role[];
}

const LEGACY_TABS: Tab[] = [
  { to: "/staff/orders", label: "Tạo Order", icon: ClipboardList, roles: ["ADMIN", "STAFF"] },
  { to: "/staff/orders-list", label: "Đơn hàng", icon: Receipt, roles: ["STAFF"] },
  { to: "/admin/orders", label: "Đơn hàng", icon: Receipt, roles: ["ADMIN"] },
  { to: "/admin/users", label: "Khách hàng", icon: Users, roles: ["ADMIN"] },
  { to: "/admin/menu", label: "Menu", icon: Package, roles: ["ADMIN"] },
  { to: "/admin/voucher-packages", label: "Điểm & Voucher", icon: Gift, roles: ["ADMIN"] },
  { to: "/admin/promotions", label: "Khuyến mãi", icon: Megaphone, roles: ["ADMIN"] },
];

const TABS: Tab[] = LEGACY_TABS
  .filter((tab) => tab.to !== "/admin/promotions")
  .map((tab) => tab.to === "/admin/voucher-packages" ? { ...tab, label: "Voucher & ưu đãi" } : tab);

interface AdminTabBarProps {
  /** Display name of the currently signed-in user. */
  userName: string;
  /** Role of the currently signed-in user. */
  userRole: Role;
  /** The main content of the layout to be rendered between the header and bottom nav. */
  children?: React.ReactNode;
}

/** AdminTabBar — client component that renders the bottom nav + top-bar actions for admin/staff shell. */
export default function AdminTabBar({ userName, userRole, children }: AdminTabBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{ to: string; from: string } | null>(null);
  const authStoreLogout = useAuthStore((s) => s.logout);
  const detachCustomer = useStaffCartStore((s) => s.detachCustomer);
  const queryClient = useQueryClient();

  const { data: pendingRes } = useQuery({
    queryKey: ["admin", "orders", "pending-count"],
    queryFn: async () => {
      const res = await fetchAdminOrders({ status: "PENDING", limit: 1 });
      return res;
    },
    refetchInterval: 20_000,
    enabled: userRole === "ADMIN",
  });
  const pendingCount = pendingRes?.meta?.total ?? 0;

  const tabs = TABS.filter((t) => t.roles.includes(userRole));
  const selectedPath = pendingNavigation?.from === pathname ? pendingNavigation.to : pathname;
  const isNavigationPending = selectedPath !== pathname;

  const handleTabClick = (event: MouseEvent<HTMLAnchorElement>, to: string) => {
    const target = event.currentTarget.target;
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (target !== "" && target !== "_self") ||
      pathname === to
    ) {
      return;
    }

    setPendingNavigation({ to, from: pathname });
  };

  const logoutMutation = useMutation({
    mutationFn: authService.logout,
    onSuccess: () => {
      detachCustomer();
      clearPrivateQueryCaches(queryClient, ["staff", "admin"]);
      authStoreLogout();
      router.replace("/");
    },
    onError: () => {
      toast.error("Không thể đăng xuất lúc này. Vui lòng thử lại.");
    },
  });

  const handleLogout = () => logoutMutation.mutate();

  return (
    <>
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground shadow-md">
        <div className="flex items-center justify-between px-2 md:px-8 h-14 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🐟</span>
            <span className="font-serif text-lg font-semibold">Bánh Cá Admin</span>
          </div>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-1 h-full mx-6">
            {tabs.map(({ to, label, icon: Icon }) => {
              const isActive = selectedPath === to || selectedPath.startsWith(to + "/");
              return (
                <Link
                  key={to}
                  href={to}
                  aria-current={isActive ? "page" : undefined}
                  onClick={(event) => handleTabClick(event, to)}
                  className={cn(
                    "relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors",
                    isActive
                      ? "text-white font-medium shadow-sm"
                      : "text-white/80 hover:text-white hover:bg-white/5"
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="admin-desktop-tab-indicator"
                      className="absolute inset-0 bg-white/15 rounded-lg pointer-events-none"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <Icon size={16} className="relative z-10" />
                  <span className="relative z-10">{label}</span>
                  {to === "/admin/orders" && pendingCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                      {pendingCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right text-xs leading-tight">
              <div className="font-medium">{userName}</div>
              <div className="opacity-80">{userRole === "ADMIN" ? "Quản lý" : "Nhân viên"}</div>
            </div>
            {userRole === "ADMIN" && (
              <button
                id="btn-store-settings"
                onClick={() => setSettingsOpen(true)}
                className="p-2 rounded-full hover:bg-white/10 transition"
                aria-label="Cài đặt cửa hàng"
              >
                <Settings size={18} />
              </button>
            )}
            <button
              onClick={handleLogout}
              className="p-2 rounded-full hover:bg-white/10 transition"
              aria-label="Đăng xuất"
            >
              {/* Inline logout icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      {isNavigationPending ? <AdminRouteSkeleton /> : children}

      {/* Bottom tab bar */}
      <nav aria-label="Điều hướng quản trị" className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(0,0,0,0.05)] md:hidden">
        <div
          className={cn(
            "flex max-w-full gap-2 overflow-x-auto overscroll-x-contain scroll-px-2 snap-x snap-mandatory px-2 py-1 touch-pan-x",
          )}
        >
          {tabs.map(({ to, label, icon: Icon }) => {
            const isActive = selectedPath === to || selectedPath.startsWith(to + "/");
            return (
              <Link
                key={to}
                href={to}
                aria-current={isActive ? "page" : undefined}
                onClick={(event) => handleTabClick(event, to)}
                className={cn(
                  "relative flex min-h-14 snap-start flex-col items-center justify-center rounded-xl py-2 text-xs transition-colors",
                  tabs.length <= 4 ? "min-w-0 flex-1" : "w-20 shrink-0",
                  isActive ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="admin-mobile-tab-indicator"
                    className="pointer-events-none absolute inset-0 rounded-xl bg-primary/5"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <motion.div
                  whileTap={{ scale: 0.85 }}
                  className="flex flex-col items-center gap-1 relative z-10"
                >
                  <div className="relative">
                    <Icon size={20} className={isActive ? "stroke-[2.5]" : undefined} />
                    {to === "/admin/orders" && pendingCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                        {pendingCount}
                      </span>
                    )}
                  </div>
                  <span className="leading-none text-[11px]">{label}</span>
                </motion.div>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Store Settings Modal — ADMIN only */}
      {userRole === "ADMIN" && (
        <StoreSettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  );
}

function AdminRouteSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Đang tải nội dung quản lý"
      className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-2 pb-20 pt-6 md:px-8 md:pb-6 touch-pan-y overflow-x-clip overscroll-x-none"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-36 animate-pulse rounded-md bg-secondary/40" />
          <div className="h-4 w-48 animate-pulse rounded-md bg-secondary/30" />
        </div>
        <div className="h-10 w-28 animate-pulse rounded-xl bg-secondary/40" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-8 w-20 animate-pulse rounded-full bg-secondary/30" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-40 animate-pulse rounded-2xl bg-secondary/30" />
        ))}
      </div>
    </main>
  );
}
