"use client";

import { useEffect, useRef, useState } from "react";
import { QrCode, ScanLine } from "lucide-react";
import { scanQrToken } from "@/src/services/staffOrderService";
import type { CustomerInfo } from "./CustomerSelectModal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface VoucherQRVerifyModalProps {
  /** The customer whose QR must be scanned. Must be existing type. */
  customerInfo: CustomerInfo & { type: "existing" };
  /** Called with the scanned qr_token when verification succeeds. */
  onVerified: (qrToken: string) => void;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Modal that scans the customer's personal QR code to verify identity before
 * submitting an order with vouchers. STAFF only — Admin bypasses automatically.
 */
export function VoucherQRVerifyModal({
  customerInfo,
  onVerified,
  onClose,
}: VoucherQRVerifyModalProps) {
  const scannerRef = useRef<InstanceType<
    typeof import("html5-qrcode").Html5Qrcode
  > | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const containerId = "qr-verify-container";

  const customerPhone =
    customerInfo.type === "existing" ? customerInfo.data.phone_number : "";

  // ── Start scanner ──────────────────────────────────────────────────────

  useEffect(() => {
    let stopped = false;

    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const scanner = new Html5Qrcode(containerId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          async (decodedText) => {
            if (processing || stopped) return;
            setProcessing(true);
            setError(null);

            try {
              const result = await scanQrToken(decodedText);

              if (result.type !== "user") {
                setError("Vui lòng quét QR cá nhân, không phải QR voucher.");
                setProcessing(false);
                return;
              }

              // Verify this QR belongs to the selected customer
              if (result.data.phone_number !== customerPhone) {
                setError(
                  `QR không khớp. Yêu cầu QR của khách ${customerPhone}.`
                );
                setProcessing(false);
                return;
              }

              // Success — pass back the raw token (decodedText = qr_token UUID)
              onVerified(decodedText);
            } catch {
              setError("Không thể đọc mã QR. Vui lòng thử lại.");
              setProcessing(false);
            }
          },
          () => {
            // Decode failure — ignore per frame
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
              try {
                scannerRef.current?.clear();
              } catch (_) {
                // ignore
              }
            });
        }
      } catch {
        try {
          scannerRef.current?.clear();
        } catch (_) {
          // ignore
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Close handler ──────────────────────────────────────────────────────

  const handleClose = () => {
    try {
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .catch(() => undefined)
          .finally(() => {
            try {
              scannerRef.current?.clear();
            } catch (_) {
              // ignore
            }
            onClose();
          });
      } else {
        onClose();
      }
    } catch {
      onClose();
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-card rounded-2xl p-5 w-full max-w-sm mx-4 shadow-xl space-y-4">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-2">
            <ScanLine size={20} className="text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="font-serif text-base font-semibold">Xác thực khách hàng</h2>
          <p className="text-xs text-muted-foreground">
            Yêu cầu khách{" "}
            <span className="font-medium text-foreground">{customerPhone}</span>{" "}
            mở QR cá nhân để xác nhận sử dụng voucher
          </p>
        </div>

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

        {/* Processing */}
        {processing && (
          <p className="text-sm text-center text-muted-foreground animate-pulse">
            Đang xác thực…
          </p>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-destructive text-center bg-destructive/10 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <button
          onClick={handleClose}
          className="w-full border border-border rounded-xl py-2 text-sm hover:bg-secondary/40 transition"
        >
          Huỷ
        </button>
      </div>
    </div>
  );
}
