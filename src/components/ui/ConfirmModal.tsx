"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Xác nhận",
  cancelLabel = "Huỷ",
  isDestructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 z-[100] bg-foreground/40 backdrop-blur-sm"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
              className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden pointer-events-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
                <h3 className="font-bold text-primary text-lg flex items-center gap-2">
                  {isDestructive ? (
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  ) : null}
                  {title}
                </h3>
                <button
                  onClick={onCancel}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-primary/40 hover:text-primary hover:bg-primary/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5">
                <p className="text-primary/70 text-sm leading-relaxed">
                  {message}
                </p>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-primary/5 flex items-center gap-3 justify-end border-t border-border/50">
                <button
                  onClick={onCancel}
                  className="px-5 py-2.5 rounded-xl font-bold text-sm text-primary/60 hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  {cancelLabel}
                </button>
                <button
                  onClick={onConfirm}
                  className={`px-5 py-2.5 rounded-xl font-bold text-sm text-white shadow-md transition-all hover:scale-105 active:scale-95 ${
                    isDestructive
                      ? "bg-red-500 hover:bg-red-600 shadow-red-500/20"
                      : "bg-primary hover:bg-primary/90 shadow-primary/20"
                  }`}
                >
                  {confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
