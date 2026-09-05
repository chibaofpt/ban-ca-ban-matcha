"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import Image from "next/image";
import { ImageIcon, Plus } from "lucide-react";
import ImageCropModal from "@/src/components/admin/ImageCropModal";

interface MenuImageCropFieldProps {
  hasExistingImage: boolean;
  currentImageUrl?: string | null;
  label?: string;
  onFileChange: (file: File | null) => void;
  onError: (message: string | null) => void;
  outputSize?: number;
  outputQuality?: number;
  compact?: boolean;
}

/** Image picker that reviews a square WebP composition before form submission. */
export default function MenuImageCropField({
  hasExistingImage,
  currentImageUrl,
  label = "Ảnh đại diện",
  onFileChange,
  onError,
  outputSize = 800,
  outputQuality = 0.75,
  compact = false,
}: MenuImageCropFieldProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  useEffect(
    () => () => {
      if (cropSourceUrl) URL.revokeObjectURL(cropSourceUrl);
    },
    [cropSourceUrl],
  );

  const selectImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      onError("Ảnh quá lớn! Vui lòng chọn ảnh nhỏ hơn 5MB.");
      return;
    }
    onError(null);
    setCropSourceUrl(URL.createObjectURL(file));
  };

  const finishCrop = (blob: Blob) => {
    const contentType = blob.type === "image/webp" ? "image/webp" : "image/png";
    const extension = contentType === "image/webp" ? "webp" : "png";
    const croppedFile = new File([blob], `crop-${Date.now()}.${extension}`, {
      type: contentType,
    });
    setPreviewUrl(URL.createObjectURL(blob));
    setCropSourceUrl(null);
    onFileChange(croppedFile);
  };

  const clearSelection = () => {
    setPreviewUrl(null);
    onFileChange(null);
  };

  return (
    <div className="space-y-2">
      <span className="text-sm font-bold text-primary">{label}</span>
      <label className={compact
        ? "group relative mx-auto flex h-20 w-20 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-secondary/10 transition-colors hover:border-primary/50 focus-within:ring-2 focus-within:ring-ring"
        : "group relative mx-auto flex aspect-square max-w-[220px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-secondary/10 transition-colors hover:border-primary/50 focus-within:ring-2 focus-within:ring-ring"}
      >
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt="Bố cục ảnh sản phẩm đã chọn"
            fill
            sizes="220px"
            unoptimized
            className="object-cover"
          />
        ) : currentImageUrl ? (
          <Image
            src={currentImageUrl}
            alt={`${label} hiện tại`}
            fill
            sizes="220px"
            className="object-cover"
          />
        ) : hasExistingImage ? (
          <ImageIcon className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        ) : (
          <span className="p-4 text-center">
            <span className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background shadow-sm">
              <Plus className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </span>
            {!compact && (
              <span className="text-xs font-medium text-muted-foreground">
                Nhấn để tải ảnh lên
              </span>
            )}
          </span>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={selectImage}
          aria-label={`Chọn ${label.toLowerCase()}`}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      {previewUrl && (
        <button
          type="button"
          onClick={clearSelection}
          className="mx-auto flex min-h-11 items-center text-xs font-medium text-destructive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Bỏ ảnh vừa chọn
        </button>
      )}
      <p className="text-center text-[11px] text-muted-foreground">
        Kéo, thu/phóng và xem trước · Khung 1:1 · WebP {outputSize}px · Tối đa 5MB
      </p>

      {cropSourceUrl && (
        <ImageCropModal
          imageSrc={cropSourceUrl}
          onCropDone={finishCrop}
          onClose={() => setCropSourceUrl(null)}
          outputSize={outputSize}
          outputQuality={outputQuality}
        />
      )}
    </div>
  );
}
