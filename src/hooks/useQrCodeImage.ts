"use client";
import { useEffect, useState } from "react";
/** Lazily generate a QR image through the existing qrcode adapter dependency. */
export function useQrCodeImage(value: string | null) {
  const [image, setImage] = useState<{ value: string; url: string } | null>(null);
  useEffect(() => {
    if (!value) return;
    let active = true;
    void import("qrcode").then((qr) => qr.toDataURL(value, { width: 256, margin: 2 })).then((url) => { if (active) setImage({ value, url }); }).catch(() => { if (active) setImage(null); });
    return () => { active = false; };
  }, [value]);
  return image?.value === value ? image.url : null;
}
