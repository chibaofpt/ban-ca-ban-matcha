"use client";

import Link from "next/link";
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

interface MenuSubTabsProps {
  selectedHref: string;
  onSelect: (href: string) => void;
}

/** MenuSubTabs — fixed four-column sub-tab bar rendered inside the /admin/menu layout. */
export default function MenuSubTabs({ selectedHref, onSelect }: MenuSubTabsProps) {
  return (
    <div className="sticky top-14 z-30 bg-background border-b border-border">
      <nav aria-label="Danh mục quản lý menu" className="mx-auto grid max-w-7xl grid-cols-4 gap-2 px-2 py-0.5 md:px-8">
        {SUB_TABS.map(({ href, label, exact }) => {
          const isActive = exact
            ? selectedHref === href
            : selectedHref === href || selectedHref.startsWith(href + "/");

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey ||
                  event.currentTarget.target !== ""
                ) {
                  return;
                }

                onSelect(href);
              }}
              className={cn(
                "relative flex min-h-8 min-w-0 items-center justify-center rounded-sm px-2 py-1 text-center text-xs font-medium whitespace-nowrap transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:px-4",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-transparent text-muted-foreground hover:bg-secondary/50 hover:text-primary"
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
