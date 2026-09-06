"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

/**
 * AnimatedTabContent — wraps menu sub-tab page content with a slide-in animation.
 * The drag/swipe functionality has been removed.
 */
export default function SwipeableTabContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <motion.div
      // Key by pathname so Framer Motion re-mounts with a slide-in animation on tab change
      key={pathname}
      // Slide-in animation when switching tabs
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
    >
      {children}
    </motion.div>
  );
}
