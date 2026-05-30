"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ClipboardList, QrCode, Package, Gift, Receipt, Leaf, Settings, Bug } from "lucide-react";
import { cn } from "@/src/utils/cn";
import type { Role } from "@/src/lib/types/user";
import * as authService from "@/src/services/authService";
import { useState } from "react";
import StoreSettingsModal from "@/src/components/admin/StoreSettingsModal";

interface Tab {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  roles: Role[];
}

const TABS: Tab[] = [
  { to: "/staff/orders", label: "Tạo Order", icon: ClipboardList, roles: ["ADMIN", "STAFF"] },
  { to: "/staff/orders-list", label: "Đơn hàng", icon: Receipt, roles: ["STAFF"] },
  { to: "/admin/orders", label: "All Đơn", icon: Receipt, roles: ["ADMIN"] },
  { to: "/staff/scan", label: "Quét QR", icon: QrCode, roles: ["ADMIN", "STAFF"] },
  { to: "/admin/menu", label: "Sản phẩm", icon: Package, roles: ["ADMIN"] },
  { to: "/admin/powders", label: "Bột Matcha", icon: Leaf, roles: ["ADMIN"] },
  { to: "/admin/voucher-packages", label: "Điểm & Voucher", icon: Gift, roles: ["ADMIN"] },
  { to: "/admin/logs", label: "System Logs", icon: Bug, roles: ["ADMIN"] },
];

interface AdminTabBarProps {
  /** Display name of the currently signed-in user. */
  userName: string;
  /** Role of the currently signed-in user. */
  userRole: Role;
}

/** AdminTabBar — client component that renders the bottom nav + top-bar actions for admin/staff shell. */
export default function AdminTabBar({ userName, userRole }: AdminTabBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const tabs = TABS.filter((t) => t.roles.includes(userRole));

  const handleLogout = async () => {
    try {
      await authService.logout();
    } finally {
      router.replace("/admin/login");
    }
  };

  return (
    <>
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground shadow-md">
        <div className="flex items-center justify-between px-4 md:px-8 h-14 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🐟</span>
            <span className="font-serif text-lg font-semibold">Bánh Cá Admin</span>
          </div>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-1 h-full mx-6">
            {tabs.map(({ to, label, icon: Icon }) => {
              const isActive = pathname === to || pathname.startsWith(to + "/");
              return (
                <Link
                  key={to}
                  href={to}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-white/15 text-white font-medium shadow-sm"
                      : "text-white/80 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Icon size={16} />
                  <span>{label}</span>
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

      {/* Bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        <div
          className={cn(
            "grid",
            tabs.length === 2 && "grid-cols-2",
            tabs.length === 3 && "grid-cols-3",
            tabs.length === 4 && "grid-cols-4",
            tabs.length === 5 && "grid-cols-5",
            tabs.length === 6 && "grid-cols-6",
            tabs.length === 7 && "grid-cols-7",
          )}
        >
          {tabs.map(({ to, label, icon: Icon }) => {
            const isActive = pathname === to || pathname.startsWith(to + "/");
            return (
              <Link
                key={to}
                href={to}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5 text-xs transition-colors",
                  isActive ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon size={20} className={isActive ? "stroke-[2.5]" : undefined} />
                <span className="leading-none text-[11px]">{label}</span>
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
