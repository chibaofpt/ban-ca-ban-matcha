"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
      <div className="flex overflow-x-auto scrollbar-none max-w-7xl mx-auto px-4 md:px-8 py-2 gap-2">
        {SUB_TABS.map(({ href, label, exact }) => {
          const isActive = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(href + "/");

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "bg-foreground text-background"
                  : "bg-transparent text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
