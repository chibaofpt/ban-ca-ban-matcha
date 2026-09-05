"use client";

import Image from "next/image";
import { ArrowDown, ArrowUp, ImageIcon, Pencil } from "lucide-react";
import AddonOptionForm from "@/src/components/admin/AddonOptionForm";
import type {
  AddonOptionCreatePayload,
  AddonOptionDetailsMutationPayload,
  AdminAddonGroup,
  AdminAddonOption,
} from "@/src/lib/types/addonGroup";
import { formatMoney } from "@/src/utils/pricing";
import { cn } from "@/src/utils/cn";

interface AddonOptionRowProps {
  group: AdminAddonGroup;
  option: AdminAddonOption;
  isFirst: boolean;
  isLast: boolean;
  isEditing: boolean;
  isBusy: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onToggle: (next: boolean) => void;
  onReorder: (direction: "up" | "down") => void;
  onSave: (
    payload: AddonOptionDetailsMutationPayload,
    imageFile: File | null,
    imageFilename: string,
  ) => Promise<void>;
}

/** Render one compact option row and its optional inline editor. */
export default function AddonOptionRow({
  group,
  option,
  isFirst,
  isLast,
  isEditing,
  isBusy,
  onEdit,
  onCancelEdit,
  onDirtyChange,
  onToggle,
  onReorder,
  onSave,
}: AddonOptionRowProps) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", !option.is_active && "bg-secondary/20")}>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-secondary/30">
          {option.image_url ? (
            <Image src={option.image_url} alt={`Ảnh ${option.label}`} width={44} height={44} sizes="44px" quality={60} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-[10rem] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{option.label}</p>
            {!option.is_active ? <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">Đã ẩn</span> : null}
          </div>
          <p className="mt-0.5 text-xs font-medium text-primary">
            {group.is_dynamic_gram
              ? option.gram_value !== null ? `+${option.gram_value}g` : "Chưa có gram"
              : option.price_vnd > 0 ? `+${formatMoney(option.price_vnd)}` : "Miễn phí"}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => onReorder("up")} disabled={isFirst || isBusy} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary disabled:opacity-30" aria-label={`Đưa ${option.label} lên`}>
            <ArrowUp className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onReorder("down")} disabled={isLast || isBusy} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary disabled:opacity-30" aria-label={`Đưa ${option.label} xuống`}>
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            id={`edit-option-${option.id}`}
            type="button"
            onClick={onEdit}
            disabled={isBusy}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-40"
            aria-label={`Sửa ${option.label}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={option.is_active}
            aria-label={`Trạng thái ${option.label}`}
            onClick={() => onToggle(!option.is_active)}
            disabled={isBusy}
            className="flex h-10 w-12 items-center justify-center rounded-full disabled:opacity-40"
          >
            <span className={cn("relative h-6 w-11 rounded-full transition-colors", option.is_active ? "bg-primary" : "bg-border")}>
              <span className={cn("absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", option.is_active && "translate-x-5")} />
            </span>
          </button>
        </div>
      </div>

      {isEditing ? (
        <div className="border-t border-border/60 bg-secondary/10 p-4">
          <AddonOptionForm
            mode="edit"
            isDynamicGram={group.is_dynamic_gram}
            option={option}
            isSubmitting={isBusy}
            onDirtyChange={onDirtyChange}
            onCancel={onCancelEdit}
            onSubmit={(payload: AddonOptionCreatePayload | AddonOptionDetailsMutationPayload, file, filename) =>
              onSave(payload as AddonOptionDetailsMutationPayload, file, filename)}
          />
        </div>
      ) : null}
    </div>
  );
}
