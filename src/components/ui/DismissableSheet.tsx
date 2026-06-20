"use client";

/**
 * Shared pull-to-dismiss bottom sheet shell.
 *
 * Encapsulates: motion values (y, scale), drag controls, AnimatePresence,
 * backdrop, body scroll lock, and the draggable sheet container.
 *
 * Each consumer passes its own animation params and classNames so that
 * existing visual behaviour is preserved exactly.
 *
 * Content-area touch handlers (pull-to-dismiss from scroll area) are exposed
 * via the `contentHandlers` render-prop so consumers like VoucherModal can
 * augment them with additional gesture logic without losing horizontal-swipe.
 */

import {
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  useDragControls,
  animate,
  type DragHandler,
  type TargetAndTransition,
} from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContentHandlers {
  onTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void;
  onTouchMove: (e: React.TouchEvent<HTMLDivElement>) => void;
  onTouchEnd: (e: React.TouchEvent<HTMLDivElement>) => void;
  ref: React.RefObject<HTMLDivElement | null>;
}

interface DismissableSheetProps {
  open: boolean;
  onClose: () => void;
  children: (contentHandlers: ContentHandlers) => ReactNode;

  // ── Animation — caller must supply exact values used before refactor ──────
  /** Spring damping. CartDrawer:25, ProductModal:30, VoucherModal:28, StaffCartDrawer:25 */
  springDamping: number;
  /** Spring stiffness. All components use 300. */
  springStiffness: number;
  /** Framer Motion `initial` for the sheet. */
  initialAnimation: TargetAndTransition;
  /** Framer Motion `animate` for the sheet. */
  animateAnimation: TargetAndTransition;
  /** Framer Motion `exit` for the sheet. */
  exitAnimation: TargetAndTransition;

  // ── Snap-back (optional — only CartDrawer has custom damping=28) ──────────
  snapBackDamping?: number;
  snapBackStiffness?: number;

  // ── Appearance — caller must supply exact classes used before refactor ────
  /** Full className for the sheet motion.div (border-radius, height, bg, etc.) */
  sheetClassName: string;
  /** Full className for the backdrop motion.div */
  backdropClassName: string;
  /** z-index for the backdrop wrapper/backdrop div */
  zIndexBackdrop: number;
  /** z-index for the sheet motion.div (as inline style) */
  zIndexSheet: number;

  // ── Drag behaviour ────────────────────────────────────────────────────────
  /** Disable drag entirely (ProductModal on desktop). Default: false */
  disableDrag?: boolean;
  /** dragElastic. All use 0.2. */
  dragElastic?: number;

  // ── Drag handle / header — rendered inside the sheet, above children ─────
  /** Content rendered in the drag-handle area (e.g. the pill bar + title row).
   *  Receives pointer-down wired to dragControls automatically. */
  dragHandleContent?: ReactNode;

  // ── Additional style for the sheet (used by CartDrawer for style object) ─
  /** Extra inline styles merged into the sheet motion.div style prop. */
  sheetStyle?: React.CSSProperties;
}

// ─── Component ────────────────────────────────────────────────────────────────

/** @see DismissableSheetProps */
export function DismissableSheet({
  open,
  onClose,
  children,
  springDamping,
  springStiffness,
  initialAnimation,
  animateAnimation,
  exitAnimation,
  snapBackDamping,
  snapBackStiffness,
  sheetClassName,
  backdropClassName,
  zIndexBackdrop,
  zIndexSheet,
  disableDrag = false,
  dragElastic = 0.2,
  dragHandleContent,
  sheetStyle,
}: DismissableSheetProps) {
  // ── Motion values ──────────────────────────────────────────────────────────
  const y = useMotionValue<number | string>(0);
  const scale = useTransform(y, (latest) => {
    if (typeof latest === "string") return 1;
    if (latest < 0) return 1;
    if (latest > 300) return 0.9;
    return 1 - (latest / 300) * 0.1;
  });
  const dragControls = useDragControls();

  // ── Content-area touch refs ────────────────────────────────────────────────
  const contentRef = useRef<HTMLDivElement | null>(null);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);

  // ── Body scroll lock — set when open, clean up when closed/unmounted ──────
  // QA R2: overflow:hidden still needed; overscroll-behavior:contain on content
  // area prevents chaining but does NOT stop body scroll when touching backdrop.
  useEffect(() => {
    if (open) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [open]);

  // ── Pull-to-dismiss touch handlers (content area) ─────────────────────────
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartY.current = e.touches[0].clientY;
    isPulling.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!contentRef.current) return;
    const scrollTop = contentRef.current.scrollTop;
    const currentY = e.touches[0].clientY;

    if (scrollTop <= 0) {
      if (!isPulling.current) {
        touchStartY.current = currentY;
        isPulling.current = true;
      }
      const deltaY = currentY - touchStartY.current;
      if (deltaY > 0) {
        y.set(deltaY);
      } else {
        y.set(0);
      }
    } else {
      isPulling.current = false;
      if (typeof y.get() === "number" && (y.get() as number) > 0) y.set(0);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    isPulling.current = false;
    if (typeof y.get() === "number" && (y.get() as number) > 100) {
      onClose();
    } else if (typeof y.get() === "number" && (y.get() as number) > 0) {
      animate(y, 0, {
        type: "spring",
        stiffness: snapBackStiffness ?? springStiffness,
        damping: snapBackDamping ?? springDamping,
      });
    }
    // NOTE: consumers (e.g. VoucherModal) may read e.changedTouches in their
    // own onTouchEnd wrapper for horizontal-swipe tab switching. The contentHandlers
    // object exposes this handler so consumers can wrap it if needed.
    void e;
  };

  // ── Drag-end handler (Framer Motion drag, via drag handle) ─────────────────
  const handleDragEnd: DragHandler = (_, info) => {
    if (info.offset.y > 100 || info.velocity.y > 300) {
      onClose();
    }
  };

  // ── Expose content handlers to children ───────────────────────────────────
  const contentHandlers: ContentHandlers = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    ref: contentRef,
  };

  // ── Drag handle pointer-down ───────────────────────────────────────────────
  const handlePointerDown = (e: React.PointerEvent) => dragControls.start(e);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — touch-none prevents scroll passthrough (QA R2) */}
          <motion.div
            key="dismissable-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 touch-none ${backdropClassName}`}
            style={{ zIndex: zIndexBackdrop }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            key="dismissable-sheet"
            initial={initialAnimation}
            animate={animateAnimation}
            exit={exitAnimation}
            transition={{ type: "spring", damping: springDamping, stiffness: springStiffness }}
            style={{
              y: disableDrag ? undefined : y,
              scale: disableDrag ? undefined : scale,
              touchAction: "pan-y",
              zIndex: zIndexSheet,
              willChange: "transform",
              WebkitBackfaceVisibility: "hidden",
              backfaceVisibility: "hidden",
              ...sheetStyle,
            }}
            drag={disableDrag ? false : "y"}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={disableDrag ? 0 : dragElastic}
            onDragEnd={disableDrag ? undefined : handleDragEnd}
            className={`dismissable-sheet ${sheetClassName}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag-handle area — wired to dragControls */}
            {dragHandleContent && (
              <div onPointerDown={handlePointerDown} className="touch-none shrink-0">
                {dragHandleContent}
              </div>
            )}

            {/* Content — rendered via render prop so consumers add their own handlers */}
            {children(contentHandlers)}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
