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

/** MenuSubTabs — fixed four-column sub-tab bar rendered inside the /admin/menu layout. */
export default function MenuSubTabs() {
  const pathname = usePathname();

  return (
    <div className="sticky top-14 z-30 bg-background border-b border-border">
      <nav aria-label="Danh mục quản lý menu" className="mx-auto grid max-w-7xl grid-cols-4 gap-2 px-2 py-2 md:px-8">
        {SUB_TABS.map(({ href, label, exact }) => {
          const isActive = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(href + "/");

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex min-h-10 min-w-0 items-center justify-center rounded-full px-1 py-2 text-center text-[11px] font-medium whitespace-nowrap transition-colors sm:px-4 sm:text-sm",
                isActive
                  ? "bg-foreground text-background"
                  : "bg-transparent text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
