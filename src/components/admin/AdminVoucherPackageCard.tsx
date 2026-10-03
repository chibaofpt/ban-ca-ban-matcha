"use client";

import { VoucherCardFrame } from "@/src/components/shared/VoucherCardFrame";
import type { VoucherPackage } from "@/src/services/adminVoucherService";

/** Renders the shared voucher summary and opens its operational detail. */
export function AdminVoucherPackageCard({ pkg, onOpen }: { pkg: VoucherPackage; onOpen: () => void }) {
  return <VoucherCardFrame title={pkg.name} description={pkg.description} expiresAfterDays={pkg.expires_after_days} onClick={onOpen} />;
}
