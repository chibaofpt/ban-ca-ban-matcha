"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";

interface NavbarOverlaysProps {
  drawerOpen: boolean;
  logoutConfirmOpen: boolean;
  onCloseDrawer: () => void;
  onCancelLogout: () => void;
  onConfirmLogout: () => Promise<void>;
}

/** Render the mobile navigation backdrop and logout confirmation layer. */
export function NavbarOverlays({
  drawerOpen,
  logoutConfirmOpen,
  onCloseDrawer,
  onCancelLogout,
  onConfirmLogout,
}: NavbarOverlaysProps) {
  return (
    <>
      <AnimatePresence>
        {drawerOpen && (
          <motion.button
            type="button"
            aria-label="Đóng menu điều hướng"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 top-16 z-40 bg-black/20 md:hidden"
            onClick={onCloseDrawer}
          />
        )}
      </AnimatePresence>
      <ConfirmModal
        isOpen={logoutConfirmOpen}
        title="Đăng xuất"
        message="Bạn có chắc chắn muốn đăng xuất không?"
        confirmLabel="Đăng xuất"
        cancelLabel="Huỷ"
        isDestructive
        onConfirm={onConfirmLogout}
        onCancel={onCancelLogout}
      />
    </>
  );
}
