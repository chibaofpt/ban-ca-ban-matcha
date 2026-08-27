"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { AlertTriangle, Loader2, X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/src/components/ui/button";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Renders the canonical confirmation alert dialog without changing existing caller contracts. */
export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Xác nhận",
  cancelLabel = "Huỷ",
  isDestructive = false,
  isLoading = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const handleOpenChange = (open: boolean) => {
    if (!open && !isLoading) onCancel();
  };

  return (
    <AlertDialog.Root open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[100] bg-foreground/40 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out data-[state=open]:fade-in" />
        <AlertDialog.Content
          data-confirm-modal="true"
          onEscapeKeyDown={(event) => {
            if (isLoading) event.preventDefault();
          }}
          className="fixed left-1/2 top-1/2 z-[101] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl bg-background shadow-2xl outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out data-[state=open]:fade-in data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <header className="flex items-center justify-between border-b border-border/50 px-6 py-4">
            <AlertDialog.Title className="flex items-center gap-2 text-lg font-bold text-primary">
              {isDestructive ? <AlertTriangle className="h-5 w-5 text-destructive" /> : null}
              {title}
            </AlertDialog.Title>
            <AlertDialog.Cancel asChild>
              <Button variant="ghost" size="icon" disabled={isLoading} aria-label="Đóng" className="rounded-full">
                <X className="h-4 w-4" />
              </Button>
            </AlertDialog.Cancel>
          </header>

          <div className="px-6 py-5">
            {children ?? (
              <AlertDialog.Description className="text-sm leading-relaxed text-primary/70">
                {message}
              </AlertDialog.Description>
            )}
            {children ? <AlertDialog.Description className="sr-only">{message}</AlertDialog.Description> : null}
          </div>

          <footer className="flex items-center justify-end gap-3 border-t border-border/50 bg-primary/5 px-6 py-4">
            <AlertDialog.Cancel asChild>
              <Button variant="ghost" disabled={isLoading}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant={isDestructive ? "destructive" : "primary"}
              disabled={isLoading}
              onClick={onConfirm}
              className="min-w-[100px]"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Đang xử lý" /> : confirmLabel}
            </Button>
          </footer>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
