"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import { useBodyScrollLock } from "@/src/hooks/useBodyScrollLock";
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

  useBodyScrollLock(open);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="auth-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm"
            onClick={close}
          />

          {/* Modal panel */}
          <motion.div
            key="auth-panel"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              data-prevent-drawer-close="true"
              className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-8 pointer-events-auto"
            >
              {/* Close button */}
              <button
                onClick={close}
                aria-label="Đóng"
                className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Form panels with slide animation */}
              <AnimatePresence mode="wait">
                {mode === "login" ? <LoginForm key="login" /> : <RegisterForm key="register" />}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default AuthModal;
