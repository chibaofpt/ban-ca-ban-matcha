"use client";

interface CustomerQRDisplayProps {
  qrToken: string;
}

/**
 * Client component to display the customer's personal QR code.
 * Uses the qrserver API for simple image rendering.
 */
export function CustomerQRDisplay({ qrToken }: CustomerQRDisplayProps) {
  // We use a generous size to ensure the scanner can read it easily
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
    qrToken
  )}`;

  const fallbackCode = qrToken.slice(-6).toUpperCase();

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="bg-white p-3 rounded-2xl shadow-sm border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrUrl}
          alt="Mã QR Cá Nhân"
          className="w-56 h-56 rounded-lg"
          draggable={false}
        />
      </div>
      <div className="bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl px-4 py-2 text-center w-full space-y-1">
        <p className="text-xs font-medium">Mã nhập thủ công</p>
        <p className="text-lg font-mono font-bold tracking-widest">
          {fallbackCode}
        </p>
      </div>
      <div className="text-center w-full">
        <p className="text-[10px] font-mono text-muted-foreground break-all opacity-50">
          {qrToken}
        </p>
      </div>
    </div>
  );
}
