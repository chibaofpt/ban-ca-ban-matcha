"use client";

import { ResponsiveOverlay, type OverlayLayer } from "@/src/components/ui/ResponsiveOverlay";
import { WelcomeRewardExperience } from "@/src/components/rewards/WelcomeRewardExperience";

interface WelcomeRewardOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewVoucher?: () => void;
  layer?: OverlayLayer;
  nested?: boolean;
}

/** Opens the reusable customer welcome reward experience in the managed overlay stack. */
export function WelcomeRewardOverlay({ open, onOpenChange, onViewVoucher, layer = "critical", nested = false }: WelcomeRewardOverlayProps) {
  return (
    <ResponsiveOverlay
      open={open}
      title="Quà chào mừng"
      description="Chọn một hộp matcha để nhận phần quà của bạn."
      layer={layer}
      nested={nested}
      size="md"
      mobileMode="dialog"
      presentation="bare"
      className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      onOpenChange={onOpenChange}
    >
      <div className="min-h-0 flex-1 touch-pan-y overflow-x-clip overflow-y-auto overscroll-x-none overscroll-contain p-4 sm:p-6">
        <WelcomeRewardExperience onDefer={() => onOpenChange(false)} onContinue={() => onOpenChange(false)} onViewVoucher={onViewVoucher} />
      </div>
    </ResponsiveOverlay>
  );
}
