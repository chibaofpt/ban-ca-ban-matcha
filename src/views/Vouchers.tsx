"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, X, Ticket, LogIn } from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/src/lib/store/authStore";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";

interface UserVoucher {
  qr_token: string;
  name: string;
  expires_at: string;
  voucher_type: "DISCOUNT" | "PRODUCT";
  discount_value?: number;
  image_url?: string;
  emoji?: string;
}

const mockVouchers: UserVoucher[] = [
  {
    qr_token: "VCH-AB12-XY99",
    name: "Giảm 20% đơn hàng",
    expires_at: "2025-08-15T00:00:00Z",
    voucher_type: "DISCOUNT",
    discount_value: 20,
  },
  {
    qr_token: "VCH-CD34-ZZ01",
    name: "Tặng 1 Matcha Latte",
    expires_at: "2025-07-30T00:00:00Z",
    voucher_type: "PRODUCT",
    emoji: "🍵",
  },
  {
    qr_token: "VCH-EF56-QQ88",
    name: "Giảm 10🐟 cho đơn từ 50🐟",
    expires_at: "2025-09-01T00:00:00Z",
    voucher_type: "DISCOUNT",
    discount_value: 10,
  },
  {
    qr_token: "VCH-GH78-WW55",
    name: "Tặng 1 Bánh Cá Taiyaki",
    expires_at: "2025-12-31T00:00:00Z",
    voucher_type: "PRODUCT",
    emoji: "🐟",
  },
];

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const Vouchers = () => {
  const [activeQr, setActiveQr] = useState<UserVoucher | null>(null);
  const isLoggedIn = useAuthStore((s) => s.user !== null);
  const openLogin = useAuthModalStore((s) => s.openLogin);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center gap-6">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <LogIn className="w-8 h-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="font-serif text-xl font-bold text-foreground">Bạn chưa đăng nhập</h2>
          <p className="text-muted-foreground text-sm">Đăng nhập để xem ví voucher của bạn</p>
        </div>
        <Button onClick={openLogin} className="rounded-xl px-8 h-11">Đăng nhập ngay</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 glass">
        <div className="container flex items-center gap-3 h-14">
          <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Link>
          <h1 className="font-serif text-lg font-bold text-foreground">Ví Voucher của bạn</h1>
        </div>
      </div>

      {/* Voucher List */}
      <div className="container py-5 space-y-4 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6">
        {mockVouchers.map((v, i) => (
          <motion.div
            key={v.qr_token}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4 }}
          >
            <Card className="overflow-hidden border-border/60">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  {v.voucher_type === "PRODUCT" && v.image_url ? (
                    <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0">
                      <img src={v.image_url} alt={v.name} className="w-full h-full object-cover" />
                    </div>
                  ) : v.voucher_type === "PRODUCT" && v.emoji ? (
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xl">{v.emoji}</span>
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Ticket className="w-5 h-5 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground leading-tight">{v.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">Hết hạn: {formatDate(v.expires_at)}</p>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      v.voucher_type === "DISCOUNT"
                        ? "bg-accent/15 text-accent"
                        : "bg-primary/15 text-primary"
                    }`}
                  >
                    {v.voucher_type === "DISCOUNT" ? "Giảm giá" : "Tặng SP"}
                  </span>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 rounded-xl text-xs h-9">
                    Dùng online
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 rounded-xl text-xs h-9"
                    onClick={() => setActiveQr(v)}
                  >
                    Dùng tại quán
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* QR Bottom Drawer */}
      <AnimatePresence>
        {activeQr && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60"
              onClick={() => setActiveQr(null)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 md:bottom-10 md:left-1/2 md:-translate-x-1/2 md:max-w-md md:rounded-3xl z-50 bg-card rounded-t-3xl p-6 pb-10 max-h-[80vh]"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-serif text-lg font-bold text-foreground">Mã QR tại quán</h2>
                <button
                  onClick={() => setActiveQr(null)}
                  className="p-1.5 rounded-full hover:bg-secondary transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <div className="flex flex-col items-center gap-4">
                <div className="w-48 h-48 bg-white rounded-2xl border-2 border-border flex items-center justify-center p-3">
                  {/* Mock QR using qr_token */}
                  <svg viewBox="0 0 100 100" className="w-full h-full">
                    <rect width="100" height="100" fill="white" />
                    {/* Simplified mock QR pattern */}
                    <rect x="10" y="10" width="25" height="25" fill="black" />
                    <rect x="65" y="10" width="25" height="25" fill="black" />
                    <rect x="10" y="65" width="25" height="25" fill="black" />
                    <rect x="15" y="15" width="15" height="15" fill="white" />
                    <rect x="70" y="15" width="15" height="15" fill="white" />
                    <rect x="15" y="70" width="15" height="15" fill="white" />
                    <rect x="19" y="19" width="7" height="7" fill="black" />
                    <rect x="74" y="19" width="7" height="7" fill="black" />
                    <rect x="19" y="74" width="7" height="7" fill="black" />
                    <rect x="40" y="10" width="5" height="5" fill="black" />
                    <rect x="50" y="10" width="5" height="5" fill="black" />
                    <rect x="40" y="20" width="5" height="5" fill="black" />
                    <rect x="45" y="25" width="5" height="5" fill="black" />
                    <rect x="40" y="40" width="5" height="5" fill="black" />
                    <rect x="50" y="45" width="5" height="5" fill="black" />
                    <rect x="60" y="50" width="5" height="5" fill="black" />
                    <rect x="70" y="45" width="5" height="5" fill="black" />
                    <rect x="45" y="55" width="5" height="5" fill="black" />
                    <rect x="55" y="60" width="5" height="5" fill="black" />
                    <rect x="65" y="65" width="5" height="5" fill="black" />
                    <rect x="75" y="75" width="5" height="5" fill="black" />
                    <rect x="80" y="65" width="5" height="5" fill="black" />
                    <rect x="85" y="55" width="5" height="5" fill="black" />
                  </svg>
                </div>

                <p className="font-mono text-sm font-semibold text-primary tracking-wider">
                  {activeQr.qr_token}
                </p>
                <p className="text-sm text-muted-foreground text-center">
                  Đưa mã này cho nhân viên để quét
                </p>
                <p className="text-xs text-muted-foreground/70">{activeQr.name}</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Vouchers;
