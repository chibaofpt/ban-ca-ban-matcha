"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { Drawer } from "vaul";

import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/cn";

export type OverlayLayer = "base" | "nested" | "critical";
export type OverlaySize = "sm" | "md" | "lg" | "full";
export type OverlayDismissPolicy = "default" | "explicit-only" | "locked-while-busy";
export type OverlayPresentation = "default" | "bare";

interface ResponsiveOverlayProps {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: OverlaySize;
  layer?: OverlayLayer;
  dismissPolicy?: OverlayDismissPolicy;
  busy?: boolean;
  showCloseButton?: boolean;
  presentation?: OverlayPresentation;
  className?: string;
  onOpenChange: (open: boolean) => void;
}

const desktopQuery = "(min-width: 768px)";
const layerClasses: Record<OverlayLayer, { overlay: string; content: string }> = {
  base: { overlay: "z-40", content: "z-50" },
  nested: { overlay: "z-[90]", content: "z-[100]" },
  critical: { overlay: "z-[190]", content: "z-[200]" },
};
const desktopSizeClasses: Record<OverlaySize, string> = {
  sm: "max-w-sm",
  md: "max-w-xl",
  lg: "max-w-3xl",
  full: "h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)]",
};

function subscribeDesktop(callback: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getDesktopSnapshot() {
  return window.matchMedia(desktopQuery).matches;
}

function getServerDesktopSnapshot() {
  return true;
}

/** Renders a Radix desktop dialog and Vaul mobile sheet behind one project contract. */
export function ResponsiveOverlay({
  open,
  title,
  description,
  children,
  footer,
  size = "md",
  layer = "base",
  dismissPolicy = "default",
  busy = false,
  showCloseButton = true,
  presentation = "default",
  className,
  onOpenChange,
}: ResponsiveOverlayProps) {
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, getServerDesktopSnapshot);
  const canDismiss = dismissPolicy === "default" || (dismissPolicy === "locked-while-busy" && !busy);
  const canExplicitlyClose = !(dismissPolicy === "locked-while-busy" && busy);
  const requestOpenChange = (nextOpen: boolean) => {
    if (nextOpen || canDismiss) onOpenChange(nextOpen);
  };
  const explicitClose = () => {
    if (canExplicitlyClose) onOpenChange(false);
  };

  if (isDesktop) {
    return (
      <Dialog.Root open={open} onOpenChange={requestOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className={cn("fixed inset-0 bg-foreground/40 backdrop-blur-sm", layerClasses[layer].overlay)} />
          <Dialog.Content
            onEscapeKeyDown={(event) => {
              if (!canDismiss) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (!canDismiss) event.preventDefault();
            }}
            className={cn(
              "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 outline-none",
              presentation === "default" && "flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] flex-col overflow-hidden rounded-3xl border bg-background shadow-2xl",
              presentation === "bare" && "w-full",
              layerClasses[layer].content,
              presentation === "default" && desktopSizeClasses[size],
              className,
            )}
          >
            {presentation === "bare" ? (
              <>
                <Dialog.Title className="sr-only">{title}</Dialog.Title>
                <Dialog.Description className="sr-only">{description ?? `Hộp thoại ${title}`}</Dialog.Description>
                {children}
              </>
            ) : <>
            <header className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-4">
              <div>
                <Dialog.Title asChild><h2 className="text-lg font-bold text-foreground">{title}</h2></Dialog.Title>
                <Dialog.Description className={description ? "mt-1 text-sm text-muted-foreground" : "sr-only"}>
                  {description ?? `Hộp thoại ${title}`}
                </Dialog.Description>
              </div>
              {showCloseButton ? (
                <Button variant="ghost" size="icon" className="shrink-0 rounded-full" disabled={!canExplicitlyClose} onClick={explicitClose} aria-label="Đóng">
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">{children}</div>
            {footer ? <footer className="shrink-0 border-t px-6 py-4">{footer}</footer> : null}
            </>}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={requestOpenChange} dismissible={canDismiss} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className={cn("fixed inset-0 bg-foreground/40 backdrop-blur-sm", layerClasses[layer].overlay)} />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 outline-none",
            presentation === "default" && "flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl border-t bg-background",
            layerClasses[layer].content,
            className,
          )}
        >
          {presentation === "bare" ? (
            <>
              <Drawer.Title className="sr-only">{title}</Drawer.Title>
              <Drawer.Description className="sr-only">{description ?? `Bảng nội dung ${title}`}</Drawer.Description>
              {children}
            </>
          ) : <>
          <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-border" aria-hidden="true" />
          <header className="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4">
            <div>
              <Drawer.Title asChild><h2 className="text-lg font-bold text-foreground">{title}</h2></Drawer.Title>
              <Drawer.Description className={description ? "mt-1 text-sm text-muted-foreground" : "sr-only"}>
                {description ?? `Bảng nội dung ${title}`}
              </Drawer.Description>
            </div>
            {showCloseButton ? (
              <Button variant="ghost" size="icon" className="shrink-0 rounded-full" disabled={!canExplicitlyClose} onClick={explicitClose} aria-label="Đóng">
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
          {footer ? <footer className="shrink-0 border-t px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">{footer}</footer> : null}
          </>}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
