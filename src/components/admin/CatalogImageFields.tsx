"use client";

import MenuImageCropField from "@/src/components/admin/MenuImageCropField";
import MenuImageSeoField from "@/src/components/admin/MenuImageSeoField";

interface CatalogImageFieldsProps {
  currentImageUrl?: string | null;
  label: string;
  imageFilename: string;
  disabled: boolean;
  onFileChange: (file: File | null) => void;
  onFilenameChange: (value: string) => void;
  onError: (message: string | null) => void;
}

/** Shared crop picker and SEO filename controls for catalog images. */
export default function CatalogImageFields({
  currentImageUrl,
  label,
  imageFilename,
  disabled,
  onFileChange,
  onFilenameChange,
  onError,
}: CatalogImageFieldsProps) {
  return (
    <section className="mb-5 space-y-4 rounded-2xl border border-border/60 bg-secondary/10 p-4">
      <MenuImageCropField
        hasExistingImage={Boolean(currentImageUrl)}
        currentImageUrl={currentImageUrl}
        label={label}
        onFileChange={onFileChange}
        onError={onError}
      />
      <MenuImageSeoField
        currentImageUrl={currentImageUrl}
        value={imageFilename}
        onChange={onFilenameChange}
        disabled={disabled}
        className="mx-0 mt-0 bg-background"
      />
    </section>
  );
}
