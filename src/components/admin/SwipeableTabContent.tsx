"use client";

import { usePathname, useRouter } from "next/navigation";
import { motion, PanInfo } from "framer-motion";
import { useRef } from "react";

const TAB_ROUTES = [
  "/admin/menu",
  "/admin/menu/powders",
  "/admin/menu/addons",
  "/admin/menu/milk-types",
];

/** Minimum horizontal drag distance (px) to trigger a tab switch. */
const SWIPE_THRESHOLD = 60;

/** Minimum velocity (px/s) to trigger a tab switch even with a short drag. */
const SWIPE_VELOCITY_THRESHOLD = 300;

/**
 * SwipeableTabContent — wraps menu sub-tab page content with horizontal swipe
 * gesture support. Swipe left to go to the next tab, swipe right to go to the
 * previous tab. Uses Framer Motion drag for a native-feeling elastic response.
 */
export default function SwipeableTabContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isDraggingRef = useRef(false);

  const currentIndex = TAB_ROUTES.findIndex((route) => pathname === route);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const { offset, velocity } = info;
    const absOffsetX = Math.abs(offset.x);
    const absVelocityX = Math.abs(velocity.x);

    const isFastSwipe = absVelocityX > SWIPE_VELOCITY_THRESHOLD;
    const isLongSwipe = absOffsetX > SWIPE_THRESHOLD;

    if (!isFastSwipe && !isLongSwipe) return;

    // Swipe left → next tab (offset.x negative)
    if (offset.x < 0 && currentIndex < TAB_ROUTES.length - 1) {
      router.push(TAB_ROUTES[currentIndex + 1]);
    }

    // Swipe right → previous tab (offset.x positive)
    if (offset.x > 0 && currentIndex > 0) {
      router.push(TAB_ROUTES[currentIndex - 1]);
    }
  };

  return (
    <motion.div
      // Key by pathname so Framer Motion re-mounts with a slide-in animation on tab change
      key={pathname}
      drag="x"
      // Constrain the drag tightly so it feels elastic, not like the page slides away
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0.08, right: 0.08 }}
      dragDirectionLock
      onDragStart={() => { isDraggingRef.current = true; }}
      onDragEnd={handleDragEnd}
      // Slide-in animation when switching tabs
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      // Prevent text selection during drag
      style={{ touchAction: "pan-y" }}
    >
      {children}
    </motion.div>
  );
}
