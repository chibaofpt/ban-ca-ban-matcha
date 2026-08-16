"use client";

import { useEffect, useRef, useState } from "react";
import { QrCode } from "lucide-react";
import { scanQrToken } from "@/src/services/staffOrderService";

// ── Types ────────────────────────────────────────────────────────────────────

interface QRScannerModalProps {
  onClose: () => void;
  /** Called when a user QR is scanned successfully. */
  onScanUser: (data: { phone_number: string }) => void;
  /** Called when a DISCOUNT voucher QR is scanned and status is ACTIVE. */
  onScanVoucherDiscount: (data: {
    qr_token: string;
    discount_type: "PERCENT" | "FIXED";
    discount_value: number;
  }) => void;
  /** Called when an order-only PRODUCT or ITEM voucher QR is scanned. */
  onScanVoucherProduct: (data: { qr_token: string; menu_item_id: string; covered_price_vnd: number }) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

/** Camera QR scanner modal using html5-qrcode. Cleans up scanner on unmount/close. */
export function QRScannerModal({
  onClose,
  onScanUser,
  onScanVoucherDiscount,
  onScanVoucherProduct,
}: QRScannerModalProps) {
  const scannerRef = useRef<InstanceType<
    typeof import("html5-qrcode").Html5Qrcode
  > | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const processingRef = useRef(false);
  const containerId = "qr-scanner-container";

  // ── Start scanner ──────────────────────────────────────────────────────

  useEffect(() => {
    let stopped = false;

    const startScanner = async () => {
      try {
        // Dynamically import to avoid SSR issues
        const { Html5Qrcode } = await import("html5-qrcode");
        const scanner = new Html5Qrcode(containerId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText) => {
            if (processingRef.current || stopped) return;
            processingRef.current = true;
            setProcessing(true);
            setError(null);

            try {
              const result = await scanQrToken(decodedText);

              if (result.type === "user") {
                onScanUser({ phone_number: result.data.phone_number });
                return;
              }

              // Voucher
              if (result.data.status !== "ACTIVE") {
                setError("Voucher đã dùng hoặc đã hết hạn.");
                processingRef.current = false;
                setProcessing(false);
                return;
              }

              if (result.data.voucher_type === "DISCOUNT") {
                const dt = result.data.discount_type;
                const dv = result.data.discount_value;
                if (dt !== null && dv !== null) {
                  onScanVoucherDiscount({
                    qr_token: result.data.qr_token,
                    discount_type: dt,
                    discount_value: dv,
                  });
                }
              } else if (result.data.voucher_type === "PRODUCT" || result.data.voucher_type === "ITEM") {
                const mid = result.data.menu_item_id;
                const cpv = result.data.covered_price_vnd;
                if (mid !== null && (result.data.voucher_type === "ITEM" || cpv !== null)) {
                  onScanVoucherProduct({
                    qr_token: result.data.qr_token,
                    menu_item_id: mid,
                    covered_price_vnd: cpv ?? 0,
                  });
                }
              }
            } catch {
              setError("Không thể đọc mã QR. Vui lòng thử lại.");
              processingRef.current = false;
              setProcessing(false);
            }
          },
          () => {
            // Decode failure — ignore (happens every frame while no QR visible)
          }
        );

        if (!stopped) setScanning(true);
      } catch {
        setError("Không thể khởi động camera. Hãy kiểm tra quyền truy cập.");
      }
    };

    startScanner();

    return () => {
      stopped = true;
      try {
        if (scannerRef.current) {
          scannerRef.current
            .stop()
            .catch(() => undefined)
            .finally(() => {
              try { scannerRef.current?.clear(); } catch {}
            });
        }
      } catch {
        try { scannerRef.current?.clear(); } catch {}
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = originalStyle; };
  }, []);

  // ── Close handler ──────────────────────────────────────────────────────

  const handleClose = () => {
    try {
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .catch(() => undefined)
          .finally(() => {
            try { scannerRef.current?.clear(); } catch {}
            onClose();
          });
      } else {
        onClose();
      }
    } catch {
      try { scannerRef.current?.clear(); } catch {}
      onClose();
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative bg-card rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl space-y-4">
        <h2 className="font-serif text-lg font-semibold">Quét QR khách hàng</h2>

        {/* Camera preview */}
        <div className="rounded-2xl overflow-hidden aspect-square bg-secondary/40 relative">
          {!scanning && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <QrCode size={48} />
              <p className="text-xs">Đang khởi động camera…</p>
            </div>
          )}
          <div id={containerId} className="w-full h-full" />
        </div>

        {/* Processing indicator */}
        {processing && (
          <p className="text-sm text-center text-muted-foreground animate-pulse">
            Đang xử lý mã QR…
          </p>
        )}

        {/* Error message */}
        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <button
          onClick={handleClose}
          className="w-full border border-border rounded-xl py-2 text-sm hover:bg-secondary/40 transition"
        >
          Đóng
        </button>
      </div>
    </div>
  );
}
