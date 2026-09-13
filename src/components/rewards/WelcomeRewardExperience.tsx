"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { VoucherCard } from "@/src/components/shared/VoucherCards";
import { useWelcomeReward } from "@/src/hooks/useWelcomeReward";
import { ApiServiceError } from "@/src/services/orderService";
import type { WelcomeReward, WelcomeRewardBox } from "@/src/services/welcomeRewardService";
import { toWelcomeRewardAnchorPercent } from "@/src/utils/welcomeRewardPresentation";

interface WelcomeRewardExperienceProps {
  initialReward?: WelcomeReward | null;
  onDefer: () => void;
  onContinue: () => void;
  onViewVoucher?: () => void;
}

const smokePuffs = [
  { className: "size-5", x: -24, y: -30, delay: 0 },
  { className: "size-4", x: 20, y: -36, delay: 0.03 },
  { className: "size-6", x: -6, y: -44, delay: 0.06 },
  { className: "size-3", x: 30, y: -22, delay: 0.08 },
];

function gridColumn(boxCount: number, index: number): string {
  const remainder = boxCount % 3;
  if (remainder === 1 && index === boxCount - 1) return "3 / span 2";
  if (remainder === 2 && index >= boxCount - 2) return `${index === boxCount - 2 ? 2 : 4} / span 2`;
  return "span 2";
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiServiceError) {
    const details = typeof error.details === "object" && error.details !== null
      ? error.details as Record<string, unknown>
      : {};
    if (details.reason === "REWARD_PAUSED") return "Chương trình đang tạm dừng. Phần quà của bạn vẫn được giữ lại.";
    if (details.reason === "REWARD_TEMPORARILY_UNAVAILABLE") return "Phần quà tạm thời chưa mở được. Bạn có thể thử lại sau.";
    return error.message;
  }
  return "Kết nối bị gián đoạn. Phần quà chưa bị mất; hãy thử lại.";
}

/** Renders the staged, server-authoritative welcome reward box experience. */
export function WelcomeRewardExperience({
  initialReward,
  onDefer,
  onContinue,
  onViewVoucher,
}: WelcomeRewardExperienceProps) {
  const reducedMotion = useReducedMotion();
  const { data: reward, isLoading, isError, refetch, openReward } = useWelcomeReward({ initialData: initialReward });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [centerStage, setCenterStage] = useState(false);
  const [centerComplete, setCenterComplete] = useState(false);
  const [showOpen, setShowOpen] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const requestIdRef = useRef<string | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const continueRef = useRef<HTMLButtonElement | null>(null);
  const selectedBox = useMemo(
    () => reward?.campaign?.boxes.find((box) => box.id === selectedId) ?? null,
    [reward, selectedId],
  );
  const completed = reward?.status === "COMPLETED" && reward.outcome !== null;
  const externallyCompleted = completed && selectedId === null;
  const resultVisible = externallyCompleted || showResult;
  const outcomeCard = reward?.outcome ? (
    reward.outcome.kind === "VOUCHER" ? <VoucherCard voucher={reward.outcome.voucher} /> : (
      <div className="rounded-2xl border border-amber-300 bg-card p-5 shadow-xl"><p className="text-sm font-semibold text-muted-foreground">Quà chào mừng</p><p className="mt-1 text-3xl font-black text-amber-600">{reward.outcome.points} 🐟</p></div>
    )
  ) : null;

  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setTimeout(() => setCenterStage(true), reducedMotion ? 150 : 280);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, selectedId]);

  useEffect(() => {
    if (!centerStage) return;
    statusRef.current?.focus();
    const timer = window.setTimeout(() => setCenterComplete(true), reducedMotion ? 150 : 280);
    return () => window.clearTimeout(timer);
  }, [centerStage, reducedMotion]);

  useEffect(() => {
    if (resultVisible) continueRef.current?.focus();
  }, [resultVisible]);

  useEffect(() => {
    if (!centerComplete || !completed) return;
    setShowOpen(true);
    const timer = window.setTimeout(() => setShowResult(true), reducedMotion ? 150 : 220);
    return () => window.clearTimeout(timer);
  }, [centerComplete, completed, reducedMotion]);

  const submitSelection = (box: WelcomeRewardBox) => {
    if (!reward || !reward.can_open || openReward.isPending) return;
    setSelectedId(box.id);
    requestIdRef.current ??= crypto.randomUUID();
    openReward.mutate({ reward_id: reward.id, box_id: box.id, request_id: requestIdRef.current });
  };

  if (isLoading && !reward) {
    return <div className="flex min-h-64 items-center justify-center" aria-live="polite"><Loader2 className="size-6 animate-spin" /><span className="sr-only">Đang tải phần quà</span></div>;
  }
  if (isError && !reward) {
    return <div className="space-y-4 py-8 text-center" role="alert"><p>Chưa thể tải phần quà. Bạn vẫn có thể tiếp tục và mở lại sau.</p><Button variant="outline" onClick={() => void refetch()}>Thử lại</Button><Button onClick={onDefer}>Tiếp tục</Button></div>;
  }
  if (reward?.mode === "GACHA" && externallyCompleted) {
    return (
      <div className="space-y-5 px-1 py-2 text-center">
        <div>
          <h2 className="font-serif text-xl font-bold text-foreground">Quà chào mừng</h2>
          <p className="mt-1 text-sm text-muted-foreground">Phần quà đã được thêm vào tài khoản của bạn</p>
        </div>
        <div className="mx-auto flex min-h-56 w-[min(19rem,90vw)] items-center justify-center py-6">
          {outcomeCard}
        </div>
        <div className="min-h-6 text-sm" role="status" aria-live="polite">
          <p className="font-semibold text-primary">Phần quà đã được thêm vào tài khoản!</p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <Button ref={continueRef} onClick={onContinue}>Tiếp tục</Button>
          {reward.outcome?.kind === "VOUCHER" && onViewVoucher ? <Button variant="outline" onClick={onViewVoucher}>Xem voucher</Button> : null}
        </div>
      </div>
    );
  }
  if (!reward || reward.mode !== "GACHA" || !reward.campaign) {
    return <div className="space-y-4 py-8 text-center"><p>Phần thưởng đã được ghi nhận cho tài khoản của bạn.</p><Button onClick={onContinue}>Tiếp tục</Button></div>;
  }

  const boxes = [...reward.campaign.boxes].sort((a, b) => a.sort_order - b.sort_order);
  const selected = selectedBox ?? boxes[0] ?? null;
  const motionDuration = reducedMotion ? 0.15 : 0.28;

  return (
    <div className="space-y-5 px-1 py-2 text-center">
      <div>
        <h2 className="font-serif text-xl font-bold text-foreground">{reward.campaign.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Chọn một hộp matcha để mở quà chào mừng</p>
      </div>

      {!centerStage ? (
        <div className="grid grid-cols-6 gap-2 sm:gap-3" aria-label="Các hộp quà matcha">
          {boxes.map((box, index) => (
            <motion.button
              key={box.id}
              layoutId={reducedMotion ? undefined : `welcome-box-${box.id}`}
              type="button"
              aria-label={`Chọn ${box.name}`}
              whileTap={{ scale: 0.96 }}
              onClick={() => submitSelection(box)}
              disabled={selectedId !== null || !reward.can_open}
              animate={selectedId ? {
                opacity: box.id === selectedId ? 1 : 0,
                scale: reducedMotion ? 1 : box.id === selectedId ? 1.04 : 0.96,
              } : { opacity: 1, scale: 1 }}
              transition={{ duration: reducedMotion ? 0.15 : 0.18, delay: reducedMotion ? 0 : Math.min(index * 0.01, 0.1) }}
              style={{ gridColumn: gridColumn(boxes.length, index) }}
              className="relative aspect-square min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
            >
              <Image src={box.closed_image_url} alt={box.name} fill sizes="(max-width: 640px) 28vw, 150px" className="object-contain p-1" />
              <Image src={box.open_image_url} alt="" fill sizes="(max-width: 640px) 28vw, 150px" className="pointer-events-none invisible object-contain p-1" />
            </motion.button>
          ))}
        </div>
      ) : selected ? (
        <div className="flex min-h-72 items-center justify-center overflow-visible py-12">
          <motion.div
            layoutId={reducedMotion ? undefined : `welcome-box-${selected.id}`}
            initial={reducedMotion ? { opacity: 0 } : undefined}
            animate={{ opacity: 1 }}
            transition={{ duration: motionDuration, ease: "easeOut" }}
            className="relative aspect-square w-40 overflow-visible rounded-3xl border border-primary/30 bg-card shadow-[0_0_32px_hsl(var(--primary)/0.22)] sm:w-48"
          >
            <motion.div animate={{ opacity: showOpen ? 0 : 1 }} transition={{ duration: reducedMotion ? 0.15 : 0.2 }} className="absolute inset-0">
              <Image src={selected.closed_image_url} alt={selected.name} fill sizes="192px" priority className="object-contain p-2" />
            </motion.div>
            <motion.div animate={{ opacity: showOpen ? 1 : 0 }} transition={{ duration: reducedMotion ? 0.15 : 0.2 }} className="absolute inset-0">
              <Image src={selected.open_image_url} alt={`${selected.name} đã mở`} fill sizes="192px" priority className="object-contain p-2" />
            </motion.div>
            <AnimatePresence>
              {showOpen ? (
                <div
                  aria-hidden="true"
                  style={{
                    left: toWelcomeRewardAnchorPercent(selected.mouth_anchor_x),
                    top: toWelcomeRewardAnchorPercent(selected.mouth_anchor_y),
                  }}
                  className="pointer-events-none absolute z-[5] size-1"
                >
                  {smokePuffs.map((puff, index) => (
                    <motion.span
                      key={index}
                      initial={{ opacity: 0 }}
                      animate={reducedMotion
                        ? { opacity: [0, 0.4, 0] }
                        : { opacity: [0, 0.5, 0], scale: [0.65, 1.2], x: [0, puff.x], y: [0, puff.y] }}
                      transition={{ duration: reducedMotion ? 0.15 : 0.36, delay: reducedMotion ? 0 : puff.delay, ease: "easeOut" }}
                      className={`absolute -left-2 -top-2 rounded-full bg-primary/35 blur-sm ${puff.className}`}
                    />
                  ))}
                </div>
              ) : null}
            </AnimatePresence>
            <AnimatePresence>
              {showResult && reward.outcome ? (
                <motion.div
                  initial={reducedMotion ? { opacity: 0, x: "-50%", y: "-50%" } : { opacity: 0, scale: 0.82, x: "-50%", y: "-45%" }}
                  animate={reducedMotion ? { opacity: 1, x: "-50%", y: "-50%" } : { opacity: 1, scale: 1, x: "-50%", y: "-115%" }}
                  transition={{ duration: reducedMotion ? 0.15 : 0.28, ease: "easeOut" }}
                  style={{
                    left: toWelcomeRewardAnchorPercent(selected.mouth_anchor_x),
                    top: toWelcomeRewardAnchorPercent(selected.mouth_anchor_y),
                  }}
                  className="absolute z-10 w-[min(19rem,90vw)]"
                >
                  {outcomeCard}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </div>
      ) : null}

      <div ref={statusRef} tabIndex={-1} className="min-h-6 text-sm focus:outline-none" role="status" aria-live="polite">
        {!reward.can_open && reward.status === "PENDING" ? <p className="text-amber-700">Chương trình đang tạm dừng. Phần quà của bạn vẫn được giữ lại.</p> : null}
        {selectedId && (!centerComplete || openReward.isPending) ? "Đang mở hộp quà của bạn…" : null}
        {openReward.isError ? <p className="text-destructive" role="alert">{errorMessage(openReward.error)}</p> : null}
        {resultVisible ? <p className="font-semibold text-primary">Phần quà đã được thêm vào tài khoản!</p> : null}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
        {!completed && (!selectedId || openReward.isError) ? <Button variant="outline" onClick={onDefer}>Để sau</Button> : null}
        {openReward.isError && selected ? <Button variant="outline" onClick={() => submitSelection(selected)}>Thử lại</Button> : null}
        {resultVisible ? <Button ref={continueRef} onClick={onContinue}>Tiếp tục</Button> : null}
        {resultVisible && reward.outcome?.kind === "VOUCHER" && onViewVoucher ? <Button variant="outline" onClick={onViewVoucher}>Xem voucher</Button> : null}
      </div>
    </div>
  );
}
