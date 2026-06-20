import MenuSubTabs from "@/src/components/admin/MenuSubTabs";
import SwipeableTabContent from "@/src/components/admin/SwipeableTabContent";

/** Shared layout for /admin/menu/* — renders sub-tab bar + swipe-to-switch content area. */
export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MenuSubTabs />
      <SwipeableTabContent>{children}</SwipeableTabContent>
    </>
  );
}
