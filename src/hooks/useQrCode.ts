"use client";

import { useEffect, useState } from "react";
import { createQrCodeDataUrl } from "@/src/utils/qrCode";

/** Generate a local QR image whenever its content or requested size changes. */
export function useQrCode(content: string, width: number): string | null {
  const [image, setImage] = useState<{ content: string; width: number; dataUrl: string } | null>(null);

  useEffect(() => {
    let active = true;
    void createQrCodeDataUrl(content, width)
      .then((next) => {
        if (active) setImage({ content, width, dataUrl: next });
      })
      .catch(() => {
        if (active) setImage(null);
      });
    return () => {
      active = false;
    };
  }, [content, width]);

  return image?.content === content && image.width === width ? image.dataUrl : null;
}
