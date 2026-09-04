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
  const dismiss = useAuthModalStore((s) => s.dismiss);
  const title = mode === "login" ? "Đăng nhập" : "Đăng ký";

  return (
    <ResponsiveOverlay
      open={open}
      title={title}
      description={`${title} tài khoản Bạn Cá Bán Matcha`}
      layer="critical"
      size="sm"
      mobileMode="dialog"
      presentation="bare"
      showCloseButton={false}
      className="w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-border bg-card shadow-2xl"
      onOpenChange={(nextOpen) => { if (!nextOpen) dismiss(); }}
    >
      <div className="relative p-8">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Đóng"
          className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>

        <AnimatePresence mode="wait">
          {mode === "login" ? <LoginForm key="login" /> : <RegisterForm key="register" />}
        </AnimatePresence>
      </div>
    </ResponsiveOverlay>
  );
};

export default AuthModal;
