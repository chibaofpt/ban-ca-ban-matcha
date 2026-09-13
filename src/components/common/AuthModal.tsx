"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import { WelcomeRewardExperience } from "@/src/components/rewards/WelcomeRewardExperience";
import type { RegisterResult } from "@/src/services/authService";
import { resolveAuthReturnTarget } from "@/src/utils/authReturnTarget";
import LoginForm from "./LoginForm";
import RegisterForm from "./RegisterForm";

/**
 * AuthModal — a centered overlay modal that renders LoginForm or RegisterForm
 * depending on the current mode in useAuthModalStore.
 * Mount this once in the root layout (or a client-boundary wrapper).
 */
const AuthModal = () => {
  const router = useRouter();
  const open = useAuthModalStore((s) => s.open);
  const mode = useAuthModalStore((s) => s.mode);
  const pendingIntent = useAuthModalStore((s) => s.pendingIntent);
  const close = useAuthModalStore((s) => s.close);
  const dismiss = useAuthModalStore((s) => s.dismiss);
  const [registration, setRegistration] = useState<RegisterResult | null>(null);
  const rewardPhase = registration?.welcome_reward.mode === "GACHA" && registration.welcome_reward.status === "PENDING";
  const title = rewardPhase ? "Quà chào mừng" : mode === "login" ? "Đăng nhập" : "Đăng ký";

  const finishRegistration = useCallback(() => {
    close();
    setRegistration(null);
    if (pendingIntent) return;
    const from = new URLSearchParams(window.location.search).get("from");
    const target = resolveAuthReturnTarget(from);
    router.push(target);
    router.refresh();
  }, [close, pendingIntent, router]);

  const handleRegistered = (result: RegisterResult) => {
    if (result.welcome_reward.mode !== "GACHA" || result.welcome_reward.status === "COMPLETED") {
      toast.success(
        result.welcome_reward.outcome_kind === "POINTS"
          ? "Quà chào mừng 5 🐟 đã được thêm vào tài khoản."
          : "Voucher chào mừng đã được thêm vào ví.",
        { duration: 3500 },
      );
      finishRegistration();
      return;
    }
    setRegistration(result);
  };

  const requestClose = () => {
    if (rewardPhase) finishRegistration();
    else dismiss();
  };

  return (
    <ResponsiveOverlay
      open={open}
      title={title}
      description={`${title} tài khoản Bạn Cá Bán Matcha`}
      layer="critical"
      size={rewardPhase ? "md" : "sm"}
      mobileMode="dialog"
      presentation="bare"
      showCloseButton={false}
      className={rewardPhase
        ? "flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        : "w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-border bg-card shadow-2xl"}
      onOpenChange={(nextOpen) => { if (!nextOpen) requestClose(); }}
      onAfterClose={() => setRegistration(null)}
    >
      <div className={rewardPhase
        ? "relative min-h-0 flex-1 touch-pan-y overflow-x-clip overflow-y-auto overscroll-x-none overscroll-contain p-4 sm:p-8"
        : "relative p-8"}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            requestClose();
          }}
          aria-label="Đóng"
          className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>

        <AnimatePresence mode="wait">
          {rewardPhase ? (
            <motion.div key="welcome-reward" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <WelcomeRewardExperience onDefer={finishRegistration} onContinue={finishRegistration} />
            </motion.div>
          ) : mode === "login" ? <LoginForm key="login" /> : <RegisterForm key="register" onRegistered={handleRegistered} />}
        </AnimatePresence>
      </div>
    </ResponsiveOverlay>
  );
};

export default AuthModal;
