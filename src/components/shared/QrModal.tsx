"use client";

import { motion } from "framer-motion";
import { Clock } from "lucide-react";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import { getVoucherBenefitText, formatVoucherExpiry } from "@/src/lib/utils/voucherModalHelpers";
import { useQrCode } from "@/src/hooks/useQrCode";

interface QrModalProps {
  voucher: MyVoucher;
  onClose: () => void;
}

/**
 * QrModal — displays a QR code for offline redemption at the counter.
 * Used as a stacked modal inside VoucherModal.
 */
export function QrModal({ voucher, onClose }: QrModalProps) {
  const qrUrl = useQrCode(voucher.qr_token, 250);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.2}
        onDragEnd={(e, info) => {
          // Trigger close if pulled down by 50px or swiped down quickly
          if (info.offset.y > 50 || info.velocity.y > 300) onClose();
        }}
        className="relative bg-card rounded-2xl p-6 w-full max-w-xs shadow-2xl space-y-4"
      >
        <div className="w-10 h-1 bg-border/60 rounded-full mx-auto mb-2 md:hidden" />
        
        <div className="text-center space-y-1">
          <h3 className="font-serif text-lg font-bold text-primary">Mã QR Voucher</h3>
          <p className="text-xs text-muted-foreground">{getVoucherBenefitText(voucher)}</p>
        </div>

        <div className="flex justify-center min-h-56 items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qrUrl && <img
            src={qrUrl}
            alt="QR Code Voucher"
            className="w-56 h-56 rounded-xl border border-border"
          />}
        </div>

        <div className="bg-secondary/30 rounded-xl p-3 text-xs text-center space-y-1">
          <p className="font-medium text-foreground">Đưa mã này cho nhân viên quét</p>
          <p className="text-muted-foreground font-mono text-[10px] break-all">{voucher.qr_token}</p>
        </div>

        {voucher.expires_at && (
          <p className="text-xs text-center text-muted-foreground">
            <Clock size={11} className="inline mr-1" />
            {formatVoucherExpiry(voucher.expires_at)}
          </p>
        )}

        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={onClose}
          className="w-full py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary/40 transition"
        >
          Đóng
        </motion.button>
      </motion.div>
    </div>
  );
}
