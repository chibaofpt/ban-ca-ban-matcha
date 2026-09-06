"use client";

import { Drawer } from "vaul";
import { QrCode, X } from "lucide-react";
import { CustomerQRDisplay } from "@/src/views/CustomerQRDisplay";

interface ProfileQRSheetProps {
  open: boolean;
  qrToken: string;
  onOpenChange: (open: boolean) => void;
}

/** Display the customer's loyalty QR inside a swipe-dismissable bottom sheet. */
export function ProfileQRSheet({
  open,
  qrToken,
  onOpenChange,
}: ProfileQRSheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[90] bg-black/45" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-[91] mx-auto flex max-h-[90dvh] max-w-lg flex-col rounded-t-[2rem] bg-card shadow-2xl outline-none">
          <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-primary/20" />
          <header className="flex items-start justify-between gap-4 border-b border-border/60 px-5 pb-4 pt-3">
            <div>
              <Drawer.Title className="flex items-center gap-2 font-serif text-xl font-bold text-primary">
                <QrCode className="h-5 w-5" />
                Mã QR tích điểm
              </Drawer.Title>
              <Drawer.Description className="mt-1 text-sm text-muted-foreground">
                Đưa mã này cho nhân viên khi thanh toán tại quầy.
              </Drawer.Description>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Đóng mã QR"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" />
            </button>
          </header>
          <div className="overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
            <CustomerQRDisplay qrToken={qrToken} />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
