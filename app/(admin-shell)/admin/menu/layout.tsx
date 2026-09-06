"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import MenuSubTabs from "@/src/components/admin/MenuSubTabs";
import SwipeableTabContent from "@/src/components/admin/SwipeableTabContent";

/** Shared layout for /admin/menu/* — renders sub-tab bar + tab content area. */
export default function MenuLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pendingTab, setPendingTab] = useState<{ href: string; from: string } | null>(null);
  const selectedHref = pendingTab?.from === pathname ? pendingTab.href : pathname;
  const isTabPending = selectedHref !== pathname;

  return (
    <>
      <MenuSubTabs selectedHref={selectedHref} onSelect={(href) => setPendingTab({ href, from: pathname })} />
      {isTabPending ? (
        <div aria-busy="true" aria-label="Đang tải nội dung quản lý menu" className="space-y-6 p-2">
          <div className="flex items-center justify-between gap-4 p-2">
            <div className="space-y-2">
              <div className="h-6 w-28 animate-pulse rounded-md bg-secondary/40" />
              <div className="h-4 w-40 animate-pulse rounded-md bg-secondary/30" />
            </div>
            <div className="h-10 w-28 animate-pulse rounded-xl bg-secondary/40" />
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-10 w-20 animate-pulse rounded-full bg-secondary/30" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-40 animate-pulse rounded-2xl bg-secondary/30" />
            ))}
          </div>
        </div>
      ) : (
        <SwipeableTabContent>{children}</SwipeableTabContent>
      )}
    </>
  );
}
