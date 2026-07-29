"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import Image from "next/image";
import { ImageIcon, Plus } from "lucide-react";
import ImageCropModal from "@/src/components/admin/ImageCropModal";

interface MenuImageCropFieldProps {
  hasExistingImage: boolean;
  onFileChange: (file: File | null) => void;
  onError: (message: string | null) => void;
}

/** Image picker that crops uploads to a square WebP before form submission. */
export default function MenuImageCropField({
  hasExistingImage,
  onFileChange,
  onError,
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
    const croppedFile = new File([blob], `crop-${Date.now()}.webp`, {
      type: "image/webp",
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
      <span className="text-sm font-bold text-primary">Ảnh đại diện</span>
      <label className="group relative mx-auto flex aspect-square max-w-[220px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-secondary/10 transition-colors hover:border-primary/50 focus-within:ring-2 focus-within:ring-ring">
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt="Ảnh sản phẩm đã cắt"
            fill
            unoptimized
            className="object-cover"
          />
        ) : hasExistingImage ? (
          <ImageIcon className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        ) : (
          <span className="p-4 text-center">
            <span className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background shadow-sm">
              <Plus className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              Nhấn để tải ảnh lên
            </span>
          </span>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={selectImage}
          aria-label="Chọn ảnh đại diện sản phẩm"
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
        Tỉ lệ 1:1 · Tự động chuyển WebP · Tối đa 5MB
      </p>

      {cropSourceUrl && (
        <ImageCropModal
          imageSrc={cropSourceUrl}
          onCropDone={finishCrop}
          onClose={() => setCropSourceUrl(null)}
        />
      )}
    </div>
  );
}
