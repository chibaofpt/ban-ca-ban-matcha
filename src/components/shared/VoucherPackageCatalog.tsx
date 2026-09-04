"use client";

import { Gift } from "lucide-react";
import { PackageCard } from "@/src/components/shared/VoucherCards";
import { filterModalPackages } from "@/src/lib/utils/voucherModalHelpers";
import type { VoucherPackage } from "@/src/services/customerVoucherService";

interface VoucherPackageCatalogProps {
  packages: VoucherPackage[];
  pointsBalance: number;
  pendingPackageId: string | null;
  onAcquire: (pkg: VoucherPackage) => void;
  onPackageClick?: (pkg: VoucherPackage) => void;
  columns?: "one" | "responsive";
}

/** Render reusable FREE_CLAIM and POINTS_EXCHANGE package sections. */
export function VoucherPackageCatalog({
  packages,
  pointsBalance,
  pendingPackageId,
  onAcquire,
  onPackageClick,
  columns = "responsive",
}: VoucherPackageCatalogProps) {
  const visible = filterModalPackages(packages);
  const free = visible.filter((pkg) => pkg.acquisition_mode === "FREE_CLAIM");
  const points = visible.filter((pkg) => pkg.acquisition_mode === "POINTS_EXCHANGE");
  const gridClass = columns === "one" ? "grid gap-3" : "grid gap-3 sm:grid-cols-2";

  if (visible.length === 0) {
    return (
      <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/60 bg-secondary/10 py-16 text-center">
        <Gift size={32} className="text-primary/30" />
        <p className="text-sm font-bold text-primary/60">Chưa có gói ưu đãi</p>
      </div>
    );
  }

  const renderCards = (items: VoucherPackage[]) => (
    <div className={gridClass}>
      {items.map((pkg) => (
        <PackageCard
          key={pkg.id}
          pkg={pkg}
          userBalance={pointsBalance}
          onExchange={onAcquire}
          isExchanging={pendingPackageId === pkg.id}
          onClick={onPackageClick}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-6 pb-8">
      {free.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h4 className="text-sm font-bold text-primary">Quà tặng miễn phí</h4>
            <span className="rounded-sm bg-yellow-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-yellow-800">Miễn phí</span>
          </div>
          {renderCards(free)}
        </section>
      )}
      {points.length > 0 && (
        <section>
          <h4 className="mb-3 text-sm font-bold text-primary">Đổi điểm lấy ưu đãi</h4>
          {renderCards(points)}
        </section>
      )}
    </div>
  );
}
