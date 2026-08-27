"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import { X, ZoomIn, ZoomOut, Check } from "lucide-react";

interface ImageCropModalProps {
  /** URL.createObjectURL hoặc data URL của ảnh gốc */
  imageSrc: string;
  /** Callback nhận Blob WebP sau khi crop xong */
  onCropDone: (blob: Blob) => void;
  /** Đóng modal mà không thay đổi gì */
  onClose: () => void;
  /** Kích thước cạnh của ảnh vuông đầu ra. */
  outputSize?: number;
  /** Chất lượng WebP canvas từ 0 đến 1. */
  outputQuality?: number;
}

/**
 * Crop vùng được chọn từ ảnh và trả về Blob WebP vuông theo cấu hình.
 * Dùng canvas API để resize + convert, không cần server-side xử lý.
 */
async function cropImageToWebP(
  imageSrc: string,
  pixelCrop: Area,
  outputSize = 800,
  quality = 0.75
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context không khả dụng."));
        return;
      }

      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        outputSize,
        outputSize
      );

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Không thể tạo blob từ canvas."));
        },
        "image/webp",
        quality
      );
    };
    image.onerror = () => reject(new Error("Không thể load ảnh để crop."));
    image.src = imageSrc;
  });
}

/** Modal crop ảnh tỉ lệ 1:1 thành WebP theo kích thước và quality đã chọn. */
export default function ImageCropModal({
  imageSrc,
  onCropDone,
  onClose,
  outputSize = 800,
  outputQuality = 0.75,
}: ImageCropModalProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setIsProcessing(true);
    setProcessingError(null);
    try {
      const blob = await cropImageToWebP(
        imageSrc,
        croppedAreaPixels,
        outputSize,
        outputQuality,
      );
      onCropDone(blob);
    } catch {
      setProcessingError("Không thể xử lý ảnh này. Vui lòng chọn ảnh khác.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-crop-title"
      className="fixed inset-0 z-[300] flex flex-col bg-black"
      /**
       * Chặn touch/pointer events bubble lên SwipeableTabContent (Framer Motion drag="x").
       * Nếu không chặn, kéo ngang trong crop area sẽ trigger swipe-to-switch-tab.
       */
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-sm border-b border-white/10 shrink-0">
        <div>
          <h3 id="image-crop-title" className="text-sm font-semibold text-white">
            Cắt ảnh sản phẩm
          </h3>
          <p className="text-[11px] text-white/50 mt-0.5">
            Di chuyển &amp; phóng to để chọn vùng hiển thị · Tỉ lệ 1:1
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={isProcessing}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40"
          aria-label="Đóng crop modal"
        >
          <X size={18} />
        </button>
      </div>

      {/* Crop area */}
      <div className="relative flex-1">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          cropShape="rect"
          showGrid={false}
          style={{
            containerStyle: { background: "#111" },
            cropAreaStyle: {
              border: "2px solid rgba(255,255,255,0.85)",
              borderRadius: "12px",
            },
          }}
        />
      </div>

      {/* Zoom slider + actions */}
      <div className="shrink-0 border-t border-white/10 bg-black/80 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-sm">
        {processingError && (
          <p role="alert" className="mb-3 text-center text-sm text-red-300">
            {processingError}
          </p>
        )}
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, z - 0.1))}
            disabled={isProcessing}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40"
            aria-label="Thu nhỏ"
          >
            <ZoomOut size={16} />
          </button>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            disabled={isProcessing}
            className="flex-1 h-1 accent-white rounded-full cursor-pointer disabled:opacity-40"
            aria-label="Mức zoom"
          />
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
            disabled={isProcessing}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40"
            aria-label="Phóng to"
          >
            <ZoomIn size={16} />
          </button>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="min-h-12 flex-1 rounded-2xl border border-white/20 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isProcessing || !croppedAreaPixels}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-white text-sm font-semibold text-black transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40"
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                Đang xử lý...
              </>
            ) : (
              <>
                <Check size={16} />
                Xác nhận
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
