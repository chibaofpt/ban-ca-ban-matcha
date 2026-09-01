"use client";

import { AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import LoginForm from "./LoginForm";
import RegisterForm from "./RegisterForm";

/**
 * AuthModal — a centered overlay modal that renders LoginForm or RegisterForm
 * depending on the current mode in useAuthModalStore.
 * Mount this once in the root layout (or a client-boundary wrapper).
 */
const AuthModal = () => {
  const open = useAuthModalStore((s) => s.open);
  const mode = useAuthModalStore((s) => s.mode);
  const close = useAuthModalStore((s) => s.close);
  const clearIntent = useAuthModalStore((s) => s.clearIntent);
  const dismiss = () => {
    clearIntent();
    close();
  };

  const title = mode === "login" ? "Đăng nhập" : "Đăng ký";
  return (
    <div data-prevent-drawer-close="true" className="contents">
      <ResponsiveOverlay
        open={open}
        title={title}
        description="Xác thực tài khoản để tiếp tục với Bạn Cá Bán Matcha"
        size="sm"
        layer="critical"
        showCloseButton={false}
        onOpenChange={(nextOpen) => { if (!nextOpen) dismiss(); }}
      >
        <div data-prevent-drawer-close="true" className="relative px-2 pb-2 pt-1">
          <button
            type="button"
            onClick={dismiss}
            aria-label="Đóng"
            className="absolute -right-2 -top-2 z-10 flex min-h-10 min-w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
          <AnimatePresence mode="wait">
            {mode === "login" ? <LoginForm key="login" /> : <RegisterForm key="register" />}
          </AnimatePresence>
        </div>
      </ResponsiveOverlay>
    </div>
  );
};

export default AuthModal;
