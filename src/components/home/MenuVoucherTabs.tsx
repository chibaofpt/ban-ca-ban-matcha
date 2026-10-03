"use client";

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import type { MenuData, MenuItem } from "@/src/lib/types/menu";
import type { VoucherPackage } from "@/src/services/customerVoucherService";
import MenuCard from "@/src/components/menu/MenuCard";
import { useVoucherModalStore } from "@/src/lib/store/voucherModalStore";
import { VoucherCardFrame } from "@/src/components/shared/VoucherCardFrame";
import { cn } from "@/src/utils/cn";

type HomeTab = "menu" | "uu-dai";

// ── Mini PackageCard (preview-only, no exchange) ─────────────────────────────

function MiniPackageCard({ pkg }: { pkg: VoucherPackage }) {
  return <VoucherCardFrame title={pkg.name} description={pkg.description} expiresAfterDays={pkg.expires_after_days} />;
}

// ── MenuVoucherTabs ───────────────────────────────────────────────────────────

interface MenuVoucherTabsProps {
  menuData?: MenuData;
  voucherPackages: VoucherPackage[];
  menuLoading: boolean;
  packageLoading: boolean;
}

/** Homepage tab section: preview of menu items and voucher packages. */
export default function MenuVoucherTabs({
  menuData,
  voucherPackages,
  menuLoading,
  packageLoading,
}: MenuVoucherTabsProps) {
  const [activeTab, setActiveTab] = useState<HomeTab>("menu");
  const router = useRouter();
  const openVoucherModal = useVoucherModalStore((s) => s.openModal);

  const menuItems = useMemo<MenuItem[]>(() => {
    if (!menuData) return [];
    const all = [...menuData.latte, ...menuData.fusion, ...(menuData.extras ?? [])];
    return all.slice(0, 4);
  }, [menuData]);

  const packages = useMemo<VoucherPackage[]>(() => voucherPackages.slice(0, 4), [voucherPackages]);


  return (
    <section className="py-20 px-4 md:px-6 bg-transparent border-t border-primary/10 relative">
      <div className="max-w-3xl md:max-w-4xl lg:max-w-5xl mx-auto">

        {/* Section header */}
        <div className="flex items-end justify-between mb-8">
          <div className="space-y-1">
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-primary text-ink">
              {activeTab === "menu" ? "Thực đơn" : "Ưu đãi"}
            </h2>
            <div className="h-1 w-10 bg-accent rounded-full" />
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 bg-primary/8 rounded-full p-1 border border-primary/12">
            {(["menu", "uu-dai"] as HomeTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-bold transition-all duration-200 cursor-pointer",
                  activeTab === tab
                    ? "bg-primary text-white shadow-sm"
                    : "text-primary/70 hover:text-primary"
                )}
              >
                {tab === "menu" ? "Thực đơn" : "Ưu đãi"}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content - Render both simultaneously to avoid image unmounting/reloading */}
        <div className="relative min-h-[320px] overflow-hidden">
          {/* Menu Tab */}
          <motion.div
            initial={false}
            animate={{
              opacity: activeTab === "menu" ? 1 : 0,
              x: activeTab === "menu" ? 0 : -30,
              pointerEvents: activeTab === "menu" ? "auto" : "none",
              visibility: activeTab === "menu" ? "visible" : "hidden"
            }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className={cn("w-full", activeTab === "menu" ? "relative" : "absolute inset-x-0 top-0")}
          >
            {menuLoading ? (
              <div className="flex flex-col gap-0 md:grid md:grid-cols-2 md:gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-[130px] bg-primary/5 animate-pulse rounded-2xl mb-4 md:mb-0" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col md:grid md:grid-cols-2 md:gap-x-8">
                {menuItems.map((item, index) => (
                  <MenuCard
                    key={item.id}
                    item={item}
                    milkTypes={menuData?.milk_types ?? []}
                    cartQuantity={0}
                    cartVariantCount={0}
                    cartHasVoucher={false}
                    onItemClick={() => router.push("/menu")}
                    priority={index < 4}
                  />
                ))}
              </div>
            )}
          </motion.div>

          {/* Vouchers Tab */}
          <motion.div
            initial={false}
            animate={{
              opacity: activeTab === "uu-dai" ? 1 : 0,
              x: activeTab === "uu-dai" ? 0 : 30,
              pointerEvents: activeTab === "uu-dai" ? "auto" : "none",
              visibility: activeTab === "uu-dai" ? "visible" : "hidden"
            }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className={cn("w-full", activeTab === "uu-dai" ? "relative" : "absolute inset-x-0 top-0")}
          >
            {packageLoading ? (
              <div className="flex flex-col gap-0 md:grid md:grid-cols-2 md:gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-[130px] bg-primary/5 animate-pulse rounded-2xl mb-4 md:mb-0" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {packages.length === 0 ? (
                  <div className="col-span-2 py-16 text-center text-primary/40">
                    <p className="text-lg font-bold">Chưa có ưu đãi nào</p>
                  </div>
                ) : (
                  packages.map((pkg) => (
                    <MiniPackageCard key={pkg.id} pkg={pkg} />
                  ))
                )}
              </div>
            )}
          </motion.div>
        </div>

        {/* See more CTA */}
        <div className="flex justify-center mt-8">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (activeTab === "menu") {
                router.push("/menu");
              } else {
                openVoucherModal();
              }
            }}
            className="group inline-flex items-center gap-2 font-bold text-sm text-primary border border-primary/25 rounded-full px-7 py-3 bg-white/40 hover:bg-white/70 transition-all shadow-paper card-handmade cursor-pointer"
          >
            <span>Xem thêm {activeTab === "menu" ? "thực đơn" : "ưu đãi"}</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </motion.button>
        </div>

      </div>
    </section>
  );
}
