"use client";

import { cn } from "@/src/utils/cn";

interface MenuImageSeoFieldProps {
  inputId?: string;
  currentImageUrl?: string | null;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  className?: string;
}

function currentFilename(publicUrl?: string | null): string | null {
  if (!publicUrl) return null;
  try {
    return decodeURIComponent(new URL(publicUrl).pathname.split("/").pop() ?? "") || null;
  } catch {
    return null;
  }
}

/** Optional SEO filename input for menu images; the value is never stored as a DB column. */
export default function MenuImageSeoField({
  inputId = "menu-image-seo-name",
  currentImageUrl,
  value,
  onChange,
  disabled,
  className,
}: MenuImageSeoFieldProps) {
  const filename = currentFilename(currentImageUrl);

  return (
    <div className={cn("mx-6 mt-4 space-y-1.5 rounded-xl border border-border/60 bg-secondary/10 p-4", className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        Tên file SEO (tuỳ chọn)
      </label>
      <input
        id={inputId}
        type="text"
        value={value}
        maxLength={80}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ví dụ: matcha-dau-do"
        className="min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <p className="text-xs text-muted-foreground">
        {filename
          ? `File hiện tại: ${filename}. Để trống nếu không muốn đổi tên.`
          : "Để trống để tự tạo tên từ tên sản phẩm khi tải ảnh lên."}
      </p>
    </div>
  );
}
