"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Drawer } from "vaul";
import * as Dialog from "@radix-ui/react-dialog";
import { X, QrCode, Star, Clock, Loader2, Ticket, Gift, LogIn } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/src/utils/cn";

import { useVoucherModalStore } from "@/src/lib/store/voucherModalStore";
import { useIsLoggedIn } from "@/src/lib/store/authStore";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import { useCustomerPoints } from "@/src/hooks/useCustomerPoints";
import { useCustomerVouchers } from "@/src/hooks/useCustomerVouchers";
import { useVoucherPackages } from "@/src/hooks/useVoucherPackages";
import { useExchangeVoucher } from "@/src/hooks/useExchangeVoucher";
import {
  type MyVoucher,
  type VoucherPackage,
} from "@/src/services/customerVoucherService";
import {
  filterModalVouchers,
  filterModalPackages,
  canInteract,
  canExchange,
  getExchangeErrorMessage,
  getVoucherBenefitText,
  getPackageBenefitText,
  formatExpiryLabel,
  formatVoucherExpiry,
  formatRedeemedDate,
  getTicketHighlightText,
  VOUCHER_TYPE_CONFIG,
} from "@/src/lib/utils/voucherModalHelpers";
import { QrModal } from "./QrModal";

import { VoucherCard, PackageCard } from "./VoucherCards";

// ── VoucherModal (Main) ───────────────────────────────────────────────────────

import { useBodyScrollLock } from "@/src/hooks/useBodyScrollLock";

export default function VoucherModal() {
  const { open, close } = useVoucherModalStore();
  useBodyScrollLock(open);
  const isLoggedIn = useIsLoggedIn();
  const openLogin = useAuthModalStore((s) => s.openLogin);
  const { data: points } = useCustomerPoints();

  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    setIsDesktop(media.matches);
    const listener = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  // Vouchers: only for logged-in users
  const { data: vouchers = [], isLoading: vLoading } = useCustomerVouchers({ enabled: open && isLoggedIn });
  // Packages: always fetch when open — public API, works for guests too
  const { data: packages = [], isLoading: pLoading } = useVoucherPackages({ enabled: open });
  const exchangeMutation = useExchangeVoucher();

  const loading = isLoggedIn ? (vLoading || pLoading) : pLoading;
  const [exchangingId, setExchangingId] = useState<string | null>(null);
  const [qrVoucher, setQrVoucher] = useState<MyVoucher | null>(null);

  // Guests default to "packages" tab; logged-in users default to "my_vouchers"
  const [activeTab, setActiveTab] = useState<"my_vouchers" | "packages">("my_vouchers");

  // When modal opens, set the correct default tab based on login state
  useEffect(() => {
    if (open) {
      setActiveTab(isLoggedIn ? "my_vouchers" : "packages");
    }
  }, [open, isLoggedIn]);

  // Pull-to-dismiss + horizontal-swipe logic.
  // Vertical pull-to-dismiss: DismissableSheet handles via contentHandlers.
  // Horizontal swipe (tab switching): wrapped in handleContentTouchEnd below.
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  /** Extended onTouchEnd: detects horizontal swipe (QA R8). */
  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const currentX = e.changedTouches[0].clientX;
    const currentY = e.changedTouches[0].clientY;
    const deltaX = currentX - touchStartX.current;
    const deltaY = currentY - touchStartY.current;
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0 && activeTab === "my_vouchers") {
        setActiveTab("packages");
      } else if (deltaX > 0 && activeTab === "packages") {
        setActiveTab("my_vouchers");
      }
    }
  };

  /** Capture touch start X/Y for horizontal swipe detection. */
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  async function handleExchange(pkg: VoucherPackage) {
    // Guest: prompt login instead of exchanging
    if (!isLoggedIn) {
      close();
      openLogin();
      return;
    }
    setExchangingId(pkg.id);
    try {
      await exchangeMutation.mutateAsync(pkg.id);
      toast.success(`Đổi thành công: ${pkg.name} 🎉`);
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { code?: string } } };
      const code = anyErr?.response?.data?.code ?? "UNKNOWN";
      toast.error(getExchangeErrorMessage(code, pkg.points_cost, points ?? 0));
    } finally {
      setExchangingId(null);
    }
  }

  const filteredVouchers = filterModalVouchers(vouchers);
  const filteredPackages = filterModalPackages(packages);

  // Body scroll lock is handled by DismissableSheet.

  // Framer motion variants for tab switching
  const tabVariants = {
    initial: (direction: number) => ({
      opacity: 0,
      x: direction > 0 ? 50 : -50,
    }),
    animate: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.2, ease: "easeOut" as const },
    },
    exit: (direction: number) => ({
      opacity: 0,
      x: direction < 0 ? 50 : -50,
      transition: { duration: 0.2, ease: "easeIn" as const },
    }),
  };
  const direction = activeTab === "my_vouchers" ? -1 : 1;

  const modalContent = (
    <>
    <div className="relative bg-background w-full md:max-w-2xl md:rounded-[2.5rem] rounded-t-[2.5rem] shadow-2xl flex flex-col h-[85vh] md:max-h-[85vh] overflow-hidden">

            {/* ── Sticky Header ── */}
            <div className="bg-background md:rounded-t-2xl z-10 px-4 pt-2 md:pt-4 pb-3">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-serif text-lg font-bold text-primary">Ưu đãi 🎁</h2>
                <button
                  onClick={close}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary/60 transition text-muted-foreground"
                  aria-label="Đóng"
                >
                  <X size={18} />
                </button>
              </div>
              {/* Points badge — logged-in only */}
              {isLoggedIn && (
                <div className="inline-flex items-center gap-1.5 bg-primary/5 border border-primary/20 rounded-full px-3 py-1.5 text-sm font-bold text-primary">
                  <Star size={14} className="text-amber-500" />
                  <span>Điểm của bạn: {(points ?? 0).toLocaleString("vi-VN")} 🐟</span>
                </div>
              )}
            </div>

            {/* ── Text Tabs ── */}
            <div className="px-4 border-b border-border/50">
              <div className="flex gap-6">
                {/* "Voucher của tôi" tab hidden for guests */}
                {isLoggedIn && (
                  <button
                    onClick={() => setActiveTab("my_vouchers")}
                    className={cn(
                      "pb-3 text-sm font-bold transition-all border-b-2 relative -mb-[1px]",
                      activeTab === "my_vouchers"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Voucher của tôi {filteredVouchers.length > 0 && `(${filteredVouchers.length})`}
                  </button>
                )}
                <button
                  onClick={() => setActiveTab("packages")}
                  className={cn(
                    "pb-3 text-sm font-bold transition-all border-b-2 relative -mb-[1px]",
                    activeTab === "packages"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  Đổi thưởng
                </button>
              </div>
            </div>

            {/* ── Scrollable Body — touch handlers extended for horizontal swipe ── */}
            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className="overflow-y-auto overscroll-contain flex-1 relative"
            >
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <Loader2 size={28} className="animate-spin text-primary" />
                  <p className="text-sm">Đang tải...</p>
                </div>
              ) : (
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={activeTab}
                    custom={direction}
                    variants={tabVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="absolute inset-0 px-4 py-4 h-max"
                  >
                    {activeTab === "my_vouchers" && isLoggedIn ? (
                      /* Section 1: My Vouchers (logged-in only) */
                      <div>
                        {filteredVouchers.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-border/60 bg-secondary/10 py-16 flex flex-col items-center gap-2 text-center mt-4">
                            <Ticket size={32} className="text-primary/30" />
                            <p className="text-sm font-bold text-primary/60">Bạn chưa có voucher nào</p>
                            <p className="text-xs text-muted-foreground">Qua tab Đổi thưởng để lấy voucher nhé!</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-8">
                            {filteredVouchers.map((v) => (
                              <VoucherCard 
                                key={v.id} 
                                voucher={v} 
                                actionNode={
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setQrVoucher(v); }}
                                    className="bg-primary/10 text-primary p-1.5 rounded-md hover:bg-primary/20 transition-colors"
                                  >
                                    <QrCode size={16} />
                                  </button>
                                }
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Section 2: Exchange Packages (public) */
                      <div>
                        {/* Guest login prompt at the top of packages tab */}
                        {!isLoggedIn && (
                          <div className="rounded-2xl bg-primary/5 border border-primary/15 px-4 py-3 flex items-center gap-3 mb-4">
                            <LogIn size={18} className="text-primary shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-primary leading-tight">Đăng nhập để đổi quà</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Tích điểm mỗi đơn, đổi voucher bất cứ lúc nào</p>
                            </div>
                            <button
                              onClick={() => { close(); openLogin(); }}
                              className="shrink-0 text-xs font-bold bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90 transition cursor-pointer"
                            >
                              Đăng nhập
                            </button>
                          </div>
                        )}
                        {filteredPackages.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-border/60 bg-secondary/10 py-16 flex flex-col items-center gap-2 text-center mt-4">
                            <Gift size={32} className="text-primary/30" />
                            <p className="text-sm font-bold text-primary/60">Chưa có gói đổi thưởng</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-8">
                            {filteredPackages.map((pkg) => (
                              <PackageCard
                                key={pkg.id}
                                pkg={pkg}
                                userBalance={points ?? 0}
                                onExchange={handleExchange}
                                isExchanging={exchangingId === pkg.id}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* QR Modal — stacked on top */}
          <AnimatePresence>
            {qrVoucher && (
              <QrModal voucher={qrVoucher} onClose={() => setQrVoucher(null)} />
            )}
          </AnimatePresence>
    </>
  );

  return (
    <>
      {isDesktop ? (
        <Dialog.Root open={open} onOpenChange={(o) => { if (!o) close(); }}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[40]" />
            <Dialog.Content className="fixed z-[50] outline-none top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl h-[85vh] max-h-[85vh] flex items-center justify-center p-4">
              {modalContent}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : (
        <Drawer.Root open={open} repositionInputs={false} onOpenChange={(o) => { if (!o) close(); }}>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[40]" />
            <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[50] outline-none bg-background rounded-t-[2.5rem] shadow-2xl flex flex-col h-[85vh] max-h-[85vh] after:content-[''] after:absolute after:inset-x-0 after:top-full after:h-[50vh] after:bg-inherit">
              <div className="absolute top-0 left-0 right-0 h-10 z-10 flex items-start justify-center pt-3 bg-transparent">
                <div className="w-12 h-1.5 bg-border/60 rounded-full" />
              </div>
              {modalContent}
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      )}
    </>
  );
}
