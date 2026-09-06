"use client";

import { useState, useCallback, useEffect } from "react";
import NextImage from "next/image";
import { motion } from "framer-motion";
import Cropper from "react-easy-crop";
import type { Area, Point, Size } from "react-easy-crop";
import { X, ZoomIn, ZoomOut, Check } from "lucide-react";

interface ImageCropModalProps {
  /** URL.createObjectURL hoặc data URL của ảnh gốc */
  imageSrc: string;
  /** Callback nhận Blob WebP, hoặc PNG fallback khi trình duyệt không encode WebP. */
  onCropDone: (blob: Blob) => void;
  /** Đóng modal mà không thay đổi gì */
  onClose: () => void;
  /** Kích thước cạnh của ảnh vuông đầu ra. */
  outputSize?: number;
  /** Chất lượng WebP canvas từ 0 đến 1. */
  outputQuality?: number;
}

/**
 * Render the unbounded percentage crop onto a transparent square image canvas.
 * Drawing the whole image preserves padding when the crop extends beyond its edges.
 */
async function cropImageToWebP(
  imageSrc: string,
  area: Area,
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
        -area.x / area.width * outputSize,
        -area.y / area.height * outputSize,
        100 / area.width * outputSize,
        100 / area.height * outputSize
      );

      const encodePng = () => {
        try {
          canvas.toBlob(
            (blob) => blob?.type === "image/png"
              ? resolve(blob)
              : reject(new Error("Không thể tạo blob từ canvas.")),
            "image/png",
          );
        } catch {
          reject(new Error("Không thể tạo blob từ canvas."));
        }
      };
      try {
        canvas.toBlob(
          (blob) => {
            if (blob?.type === "image/webp" || blob?.type === "image/png") resolve(blob);
            else encodePng();
          },
          "image/webp",
          quality,
        );
      } catch {
        encodePng();
      }
    };
    image.onerror = () => reject(new Error("Không thể load ảnh để crop."));
    image.src = imageSrc;
  });
}

/** Compose any image in a square frame and review the exported WebP before using it. */
export default function ImageCropModal({
  imageSrc,
  onCropDone,
  onClose,
  outputSize = 800,
  outputQuality = 0.75,
}: ImageCropModalProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [mediaSize, setMediaSize] = useState<Size | null>(null);
  const [cropSize, setCropSize] = useState<Size | null>(null);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);

  const onCropAreaChange = useCallback((area: Area) => {
    setCroppedArea(area);
  }, []);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);
  const fitZoom = mediaSize && cropSize
    ? Math.min(cropSize.width / mediaSize.width, cropSize.height / mediaSize.height) : 1;
  const fillZoom = mediaSize ? Math.max(mediaSize.width / mediaSize.height, mediaSize.height / mediaSize.width) : 1;
  const maxZoom = Math.max(3, fillZoom);
  const ready = Boolean(mediaSize && cropSize && croppedArea);
  const frameImage = (nextZoom: number) => {
    setCrop({ x: 0, y: 0 });
    setZoom(nextZoom);
  };

  const handleConfirm = async () => {
    if (!croppedArea || !ready || isProcessing) return;
    if (preview) {
      onCropDone(preview.blob);
      return;
    }
    setIsProcessing(true);
    setProcessingError(null);
    try {
      const blob = await cropImageToWebP(
        imageSrc,
        croppedArea,
        outputSize,
        outputQuality,
      );
      setPreview({ blob, url: URL.createObjectURL(blob) });
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
      className="fixed inset-0 z-[300] flex flex-col overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none bg-black"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-sm border-b border-white/10 shrink-0">
        <div>
          <h3 id="image-crop-title" className="text-sm font-semibold text-white">
            {preview ? "Xem trước ảnh sản phẩm" : "Bố cục ảnh sản phẩm"}
          </h3>
          <p className="text-[11px] text-white/50 mt-0.5">
            {preview ? "Ảnh WebP trên nền thẻ · Dùng ảnh này hoặc quay lại chỉnh" : "Kéo và thu/phóng trong khung 1:1 · Vùng trống giữ trong suốt"}
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
      <div className="relative min-h-40 flex-1">
        <div className={preview ? "invisible absolute inset-0" : "absolute inset-0"} inert={isProcessing || Boolean(preview)}>
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom * fitZoom}
          minZoom={0.1 * fitZoom}
          maxZoom={maxZoom * fitZoom}
          restrictPosition={false}
          objectFit="contain"
          setMediaSize={setMediaSize}
          onCropSizeChange={setCropSize}
          mediaProps={{ onError: () => setProcessingError("Không thể đọc ảnh. Vui lòng chọn ảnh khác.") }}
          aspect={1}
          onCropChange={setCrop}
          onZoomChange={(value) => setZoom(value / fitZoom)}
          onCropAreaChange={onCropAreaChange}
          cropShape="rect"
          showGrid={false}
          style={{
            containerStyle: {
              backgroundColor: "var(--background)",
              backgroundImage: "conic-gradient(var(--muted) 25%, transparent 0 50%, var(--muted) 0 75%, transparent 0)",
              backgroundSize: "20px 20px",
            },
            cropAreaStyle: {
              border: "2px solid rgba(255,255,255,0.85)",
              borderRadius: "12px",
            },
          }}
        />
        </div>
        {preview && (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-background p-4">
            <NextImage src={preview.url} alt="Bố cục ảnh sẽ được lưu" width={outputSize} height={outputSize} unoptimized className="max-h-full w-auto max-w-full object-contain bg-card" />
          </div>
        )}
      </div>

      {/* Zoom slider + actions */}
      <div className="shrink-0 border-t border-white/10 bg-black/80 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-sm">
        {processingError && (
          <p role="alert" className="mb-3 text-center text-sm text-red-300">
            {processingError}
          </p>
        )}
        <fieldset disabled={isProcessing || Boolean(preview) || !ready} className="min-w-0">
        <div className="mb-2 grid grid-cols-3 gap-2">
          {[{ label: "Vừa khung", value: 1 }, { label: "Lấp đầy", value: fillZoom }, { label: "Đặt lại", value: 1 }].map(({ label, value }) => (
            <motion.button key={label} type="button" whileTap={{ scale: 0.96 }} onClick={() => frameImage(value)} className="min-h-11 rounded-xl bg-secondary text-xs font-semibold text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
              {label}
            </motion.button>
          ))}
        </div>
        <label htmlFor="image-composition-zoom" className="block text-xs text-white">Kích thước ảnh · {Math.round(zoom * 100)}% so với vừa khung</label>
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.1, z - 0.1))}
            disabled={isProcessing}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40"
            aria-label="Thu nhỏ"
          >
            <ZoomOut size={16} />
          </button>
          <input
            id="image-composition-zoom"
            type="range"
            min={0.1}
            max={maxZoom}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            disabled={isProcessing}
            className="min-w-0 flex-1 h-11 accent-white rounded-full cursor-pointer disabled:opacity-40"
            aria-label="Mức zoom"
          />
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(maxZoom, z + 0.1))}
            disabled={isProcessing}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40"
            aria-label="Phóng to"
          >
            <ZoomIn size={16} />
          </button>
        </div>
        </fieldset>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => preview ? setPreview(null) : onClose()}
            disabled={isProcessing}
            className="min-h-12 flex-1 rounded-2xl border border-white/20 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40"
          >
            {preview ? "Chỉnh lại" : "Hủy"}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isProcessing || !ready}
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
                {preview ? "Dùng ảnh này" : "Xem trước"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
