"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { Drawer } from "vaul";

import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/cn";
import { OverlayStackScope, useOverlayRegistration, type OverlayLayer } from "@/src/components/ui/OverlayStackProvider";

export type { OverlayLayer } from "@/src/components/ui/OverlayStackProvider";

export type OverlaySize = "sm" | "md" | "lg" | "full";
export type OverlayDismissPolicy = "default" | "explicit-only" | "locked-while-busy";
export type OverlayPresentation = "default" | "bare";
export type OverlayMobileMode = "sheet" | "dialog";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

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
  mobileMode?: OverlayMobileMode;
  /** Coordinate this mobile sheet with an owning Vaul drawer. */
  nested?: boolean;
  className?: string;
  onOpenChange: (open: boolean) => void;
  onAfterClose?: () => void;
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
  mobileMode = "sheet",
  nested = false,
  className,
  onOpenChange,
  onAfterClose,
}: ResponsiveOverlayProps) {
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, getServerDesktopSnapshot);
  const usesDialog = isDesktop || mobileMode === "dialog";
  const registration = useOverlayRegistration(layer, open, { deferRelease: true });
  const { release } = registration;
  const openRef = useRef(open);
  useIsomorphicLayoutEffect(() => {
    openRef.current = open;
  }, [open]);
  const closeReported = useRef(false);
  const completeClose = useCallback(() => {
    if (openRef.current) return;
    release();
    if (closeReported.current) return;
    closeReported.current = true;
    onAfterClose?.();
  }, [onAfterClose, release]);
  const handleCloseAutoFocus = useCallback(() => {
    queueMicrotask(completeClose);
  }, [completeClose]);
  const canDismiss = (dismissPolicy === "default" || (dismissPolicy === "locked-while-busy" && !busy)) && registration.isTopmost;
  const canExplicitlyClose = !(dismissPolicy === "locked-while-busy" && busy) && registration.isTopmost;
  const requestOpenChange = (nextOpen: boolean) => {
    if (nextOpen || canDismiss) onOpenChange(nextOpen);
  };
  const explicitClose = () => {
    if (canExplicitlyClose) onOpenChange(false);
  };

  const scopedChildren = <OverlayStackScope ownerId={registration.id} supportsNestedDrawer={!usesDialog}>{children}</OverlayStackScope>;
  const scopedFooter = footer ? <OverlayStackScope ownerId={registration.id} supportsNestedDrawer={!usesDialog}>{footer}</OverlayStackScope> : null;
  const visualZIndex = registration.visualZIndex;

  if (usesDialog) {
    return (
      <Dialog.Root open={open} onOpenChange={requestOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay
            style={visualZIndex === undefined ? undefined : { zIndex: visualZIndex }}
            className={cn("fixed inset-0 bg-foreground/40 backdrop-blur-sm", layerClasses[layer].overlay)}
          />
          <Dialog.Content
            onOpenAutoFocus={() => {
              closeReported.current = false;
            }}
            onCloseAutoFocus={handleCloseAutoFocus}
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
            style={visualZIndex === undefined ? undefined : { zIndex: visualZIndex + 1 }}
          >
            {presentation === "bare" ? (
              <>
                <Dialog.Title className="sr-only">{title}</Dialog.Title>
                <Dialog.Description className="sr-only">{description ?? `Hộp thoại ${title}`}</Dialog.Description>
                {scopedChildren}
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
            <div className="min-h-0 flex-1 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none overscroll-contain px-6 py-5">{scopedChildren}</div>
            {scopedFooter ? <footer className="shrink-0 border-t px-6 py-4">{scopedFooter}</footer> : null}
            </>}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  const MobileDrawerRoot = nested
    ? Drawer.NestedRoot
    : registration.managed && registration.parent?.supportsNestedDrawer ? Drawer.NestedRoot : Drawer.Root;

  return (
    <MobileDrawerRoot
      open={open}
      onOpenChange={requestOpenChange}
       onAnimationEnd={(nextOpen) => { if (nextOpen) return; if (!openRef.current) completeClose(); }}
      dismissible={canDismiss}
      repositionInputs={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay
          style={visualZIndex === undefined ? undefined : { zIndex: visualZIndex }}
          className={cn("fixed inset-0 bg-foreground/40 backdrop-blur-sm", layerClasses[layer].overlay)}
        />
        <Drawer.Content
          onOpenAutoFocus={() => {
            closeReported.current = false;
          }}
          onCloseAutoFocus={handleCloseAutoFocus}
          style={visualZIndex === undefined ? undefined : { zIndex: visualZIndex + 1 }}
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
              {scopedChildren}
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
          <div className="min-h-0 flex-1 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none overscroll-contain px-5 py-5">{scopedChildren}</div>
          {scopedFooter ? <footer className="shrink-0 border-t px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">{scopedFooter}</footer> : null}
          </>}
        </Drawer.Content>
      </Drawer.Portal>
    </MobileDrawerRoot>
  );
}
