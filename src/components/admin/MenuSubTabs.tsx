"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/src/utils/cn";

interface SubTab {
  href: string;
  label: string;
  /** Match exact path or any sub-path under this href. */
  exact?: boolean;
}

const SUB_TABS: SubTab[] = [
  { href: "/admin/menu", label: "Sản phẩm", exact: true },
  { href: "/admin/menu/powders", label: "Bột" },
  { href: "/admin/menu/addons", label: "Addons" },
  { href: "/admin/menu/milk-types", label: "Base Liquid" },
];

/** MenuSubTabs — horizontal sub-tab bar rendered inside the /admin/menu layout. */
export default function MenuSubTabs() {
  const pathname = usePathname();

  return (
    <div className="sticky top-14 z-30 bg-background border-b border-border">
      <div className="flex overflow-x-auto scrollbar-none max-w-7xl mx-auto px-4 md:px-8">
        {SUB_TABS.map(({ href, label, exact }) => {
          const isActive = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(href + "/");

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex-shrink-0 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
              {isActive && (
                <motion.div
                  layoutId="menu-sub-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
