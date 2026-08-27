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
  cropPreset?: "full" | "compact";
  layout?: "panel" | "inline";
  inputId?: string;
}

const CROP_PRESETS = {
  full: { outputSize: 800, outputQuality: 0.75 },
  compact: { outputSize: 320, outputQuality: 0.7 },
} as const;

/** Shared crop picker and SEO filename controls for catalog images. */
export default function CatalogImageFields({
  currentImageUrl,
  label,
  imageFilename,
  disabled,
  onFileChange,
  onFilenameChange,
  onError,
  cropPreset = "full",
  layout = "panel",
  inputId,
}: CatalogImageFieldsProps) {
  const cropSettings = CROP_PRESETS[cropPreset];
  return (
    <section className={layout === "inline"
      ? "space-y-3 rounded-xl border border-border/60 bg-secondary/10 p-3"
      : "mb-5 space-y-4 rounded-2xl border border-border/60 bg-secondary/10 p-4"}
    >
      <MenuImageCropField
        hasExistingImage={Boolean(currentImageUrl)}
        currentImageUrl={currentImageUrl}
        label={label}
        onFileChange={onFileChange}
        onError={onError}
        outputSize={cropSettings.outputSize}
        outputQuality={cropSettings.outputQuality}
        compact={layout === "inline"}
      />
      <MenuImageSeoField
        inputId={inputId}
        currentImageUrl={currentImageUrl}
        value={imageFilename}
        onChange={onFilenameChange}
        disabled={disabled}
        className={layout === "inline" ? "mx-0 mt-0 border-0 bg-transparent p-0" : "mx-0 mt-0 bg-background"}
      />
    </section>
  );
}
