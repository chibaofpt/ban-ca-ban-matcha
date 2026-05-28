"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Star, Gift } from "lucide-react";
import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";

interface VoucherPackage {
  package_id: string;
  name: string;
  points_cost: number;
  voucher_type: "DISCOUNT" | "PRODUCT";
  image_url?: string;
  emoji?: string;
}

const USER_POINTS = 150;

const mockPackages: VoucherPackage[] = [
  { package_id: "pkg-001", name: "Giảm 10🐟 đơn hàng", points_cost: 50, voucher_type: "DISCOUNT" },
  { package_id: "pkg-002", name: "Matcha Latte miễn phí", points_cost: 100, voucher_type: "PRODUCT", emoji: "🍵" },
  { package_id: "pkg-003", name: "Giảm 50🐟 đơn từ 100🐟", points_cost: 200, voucher_type: "DISCOUNT" },
  { package_id: "pkg-004", name: "Bánh Cá Taiyaki miễn phí", points_cost: 80, voucher_type: "PRODUCT", emoji: "🐟" },
  { package_id: "pkg-005", name: "Combo trà chiều cho 2", points_cost: 300, voucher_type: "PRODUCT", emoji: "🫖" },
  { package_id: "pkg-006", name: "Giảm 20% toàn menu", points_cost: 150, voucher_type: "DISCOUNT" },
];

const Points = () => {
  return (
    <div className="min-h-screen bg-background pb-6">
      {/* Sticky Header */}
      <div className="sticky top-0 z-40 glass">
        <div className="container flex items-center gap-3 h-14">
          <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Link>
          <h1 className="font-serif text-lg font-bold text-foreground">Đổi điểm</h1>
        </div>

        {/* Points banner */}
        <div className="container pb-4">
          <div className="bg-primary rounded-2xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary-foreground/20 flex items-center justify-center">
              <Star className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <p className="text-primary-foreground/70 text-xs font-medium">Điểm hiện tại</p>
              <p className="text-primary-foreground text-2xl font-bold font-serif">
                {USER_POINTS} <span className="text-base font-sans font-medium">Điểm</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Discount Vouchers */}
      <div className="container pt-4">
        <h2 className="text-sm font-bold text-foreground mb-2.5 font-serif">Ưu đãi giảm giá</h2>
        <div className="flex flex-col md:grid md:grid-cols-2 lg:grid-cols-3 gap-2.5 md:gap-6">
          {mockPackages.filter(p => p.voucher_type === "DISCOUNT").map((pkg, i) => {
            const canAfford = USER_POINTS >= pkg.points_cost;
            return (
              <motion.div
                key={pkg.package_id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06, duration: 0.3 }}
              >
                <Card className={`border-border/60 ${!canAfford ? "opacity-60" : ""}`}>
                  <CardContent className="p-3.5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Gift className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground leading-tight truncate">{pkg.name}</p>
                      <p className="text-xs mt-0.5 font-bold text-accent">Đổi {pkg.points_cost} Điểm</p>
                    </div>
                    <Button size="sm" className="rounded-xl text-xs h-8 shrink-0" disabled={!canAfford}>
                      {canAfford ? "Đổi" : "Thiếu"}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Product Vouchers */}
      <div className="container pt-5">
        <h2 className="text-sm font-bold text-foreground mb-2.5 font-serif">Đổi sản phẩm</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-6">
          {mockPackages.filter(p => p.voucher_type === "PRODUCT").map((pkg, i) => {
            const canAfford = USER_POINTS >= pkg.points_cost;
            return (
              <motion.div
                key={pkg.package_id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.06, duration: 0.35 }}
              >
                <Card className={`h-full border-border/60 ${!canAfford ? "opacity-60" : ""}`}>
                  <CardContent className="p-3.5 flex flex-col h-full gap-3">
                    {pkg.image_url ? (
                      <div className="w-full aspect-square rounded-xl overflow-hidden bg-muted">
                        <img src={pkg.image_url} alt={pkg.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-full aspect-square rounded-xl bg-primary/10 flex items-center justify-center">
                        <span className="text-3xl">{pkg.emoji || "🎁"}</span>
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-foreground leading-tight">{pkg.name}</p>
                      <p className="text-xs mt-1.5 font-bold text-accent">Đổi {pkg.points_cost} Điểm</p>
                    </div>
                    <Button size="sm" className="w-full rounded-xl text-xs h-8" disabled={!canAfford}>
                      {canAfford ? "Đổi ngay" : "Không đủ điểm"}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Points;
