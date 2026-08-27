"use client";

import { motion } from "framer-motion";

import type { VoucherPackage } from "@/src/services/adminVoucherService";
import { getVoucherPackageStatus, summarizeVoucherBenefit, summarizeVoucherCapacity, summarizeVoucherCondition, summarizeVoucherDeadline } from "@/src/lib/utils/adminVoucherPresentation";
import { cn } from "@/src/utils/cn";

const STATUS = { ACTIVE: ["Đang phát hành", "bg-emerald-100 text-emerald-800"], PAUSED: ["Tạm dừng", "bg-amber-100 text-amber-800"], SOLD_OUT: ["Hết lượt", "bg-slate-100 text-slate-700"], ENDED: ["Đã kết thúc", "bg-slate-100 text-slate-700"] } as const;
const TYPE: Record<VoucherPackage["voucher_type"], string> = { ITEM: "Món tặng", PRODUCT: "Sản phẩm", PRODUCT_DISCOUNT: "Giảm theo món", ADDON: "Addon", DISCOUNT: "Giảm giá", FREESHIP: "Freeship", BUNDLE: "Mua X tặng Y" };

/** Renders the tappable operational summary for one voucher package. */
export function AdminVoucherPackageCard({ pkg, onOpen }: { pkg: VoucherPackage; onOpen: () => void }) {
  const status = getVoucherPackageStatus(pkg);
  return <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={onOpen} className="w-full rounded-2xl border bg-card p-4 text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
    <span className={cn("inline-flex rounded-full px-2 py-1 text-[11px] font-bold", STATUS[status][1])}>{STATUS[status][0]}</span>
    <h2 className="mt-3 font-bold">{pkg.name}</h2>
    <p className="mt-1 text-xs text-muted-foreground">{TYPE[pkg.voucher_type]} · {pkg.acquisition_mode === "POINTS_EXCHANGE" ? `${pkg.points_cost} điểm` : pkg.acquisition_mode === "AUTO_GRANT" ? "Tự động cấp" : "Nhận miễn phí"}</p>
    <p className="mt-3 text-sm">{summarizeVoucherBenefit(pkg)}</p>
    <p className="mt-2 text-xs text-muted-foreground">{summarizeVoucherCondition(pkg)}</p>
    <p className="mt-1 text-xs text-muted-foreground">{summarizeVoucherDeadline(pkg)}</p>
    <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">{summarizeVoucherCapacity(pkg)}</p>
  </motion.button>;
}
