"use client";

import { useState } from "react";
import { CheckCircle2, Copy } from "lucide-react";
import { motion } from "framer-motion";
import { formatKa } from "@/src/utils/display";

interface PaymentQrPanelProps {
  qrUrl: string;
  orderCode: string;
  amountVnd: number;
}

/** Shared VietQR panel used by customer history and staff counter payment. */
export function PaymentQrPanel({ qrUrl, orderCode, amountVnd }: PaymentQrPanelProps) {
  const [copied, setCopied] = useState(false);

  const copyOrderCode = async (): Promise<void> => {
    await navigator.clipboard.writeText(orderCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3 rounded-xl border border-border/50 bg-secondary/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold">Quét QR thanh toán</p>
          <p className="mt-0.5 text-sm font-bold text-primary">{formatKa(amountVnd, "ceil")}</p>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          transition={{ duration: 0.18 }}
          onClick={() => void copyOrderCode()}
          className="flex min-h-11 items-center gap-1 rounded-lg border bg-background px-3 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
          {copied ? "Đã chép" : "Chép mã"}
        </motion.button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={qrUrl}
        alt={`QR thanh toán ${orderCode}`}
        width={220}
        height={220}
        className="mx-auto h-52 w-52 rounded-xl border bg-white object-contain"
      />
      <p className="text-center text-[11px] text-amber-800">
        Nội dung chuyển khoản: <strong className="font-mono">{orderCode}</strong>
      </p>
    </div>
  );
}
