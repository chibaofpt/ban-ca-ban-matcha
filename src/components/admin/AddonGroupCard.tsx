"use client";

import Image from "next/image";
import { ArrowDown, ArrowUp, ImageIcon, Pencil, Plus } from "lucide-react";
import AddonGroupInlineForm from "@/src/components/admin/AddonGroupInlineForm";
import AddonOptionRow from "@/src/components/admin/AddonOptionRow";
import type {
  AddonGroupDetailsMutationPayload,
  AddonOptionDetailsMutationPayload,
  AdminAddonGroup,
} from "@/src/lib/types/addonGroup";
import { cn } from "@/src/utils/cn";

interface AddonGroupCardProps {
  item: AdminAddonGroup;
  isFirst: boolean;
  isLast: boolean;
  canReorderGroup: boolean;
  isEditingGroup: boolean;
  editingOptionId: string | null;
  busyKey: string | null;
  onEditGroup: () => void;
  onCancelEdit: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onToggleGroup: (next: boolean) => void;
  onReorderGroup: (direction: "up" | "down") => void;
  onCreateOption: () => void;
  onEditOption: (optionId: string) => void;
  onToggleOption: (optionId: string, next: boolean) => void;
  onReorderOption: (optionId: string, direction: "up" | "down") => void;
  onSaveGroup: (
    payload: AddonGroupDetailsMutationPayload,
    imageFile: File | null,
    imageFilename: string,
  ) => Promise<void>;
  onSaveOption: (
    optionId: string,
    payload: AddonOptionDetailsMutationPayload,
    imageFile: File | null,
    imageFilename: string,
  ) => Promise<void>;
}

/** Display a complete add-on group with its always-visible option list. */
export default function AddonGroupCard({
  item,
  isFirst,
  isLast,
  canReorderGroup,
  isEditingGroup,
  editingOptionId,
  busyKey,
  onEditGroup,
  onCancelEdit,
  onDirtyChange,
  onToggleGroup,
  onReorderGroup,
  onCreateOption,
  onEditOption,
  onToggleOption,
  onReorderOption,
  onSaveGroup,
  onSaveOption,
}: AddonGroupCardProps) {
  const activeOptionCount = item.options.filter((option) => option.is_active).length;
  const isGroupBusy = busyKey === `group:${item.id}` || busyKey === `group-toggle:${item.id}`;
  const isReordering = busyKey === "reorder";

  return (
    <article className={cn("overflow-hidden rounded-2xl border border-border bg-card shadow-sm", !item.is_active && "border-dashed")}>
      <header className="flex flex-wrap items-start gap-4 p-4 sm:p-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-secondary/30">
          {item.image_url ? (
            <Image src={item.image_url} alt={`Ảnh ${item.name}`} width={64} height={64} sizes="64px" quality={65} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-[12rem] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-foreground">{item.name}</h2>
            <span className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              item.is_dynamic_gram
                ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                : "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
            )}>
              {item.is_dynamic_gram ? "Theo gram bột" : "Giá cố định"}
            </span>
            {!item.is_active ? <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">Đã ẩn</span> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Chọn tối đa {item.max_select} · {activeOptionCount}/{item.options.length} option đang hiển thị
          </p>
          {item.description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p> : null}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => onReorderGroup("up")} disabled={!canReorderGroup || isFirst || isReordering} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary disabled:opacity-30" aria-label={`Đưa nhóm ${item.name} lên`}>
            <ArrowUp className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onReorderGroup("down")} disabled={!canReorderGroup || isLast || isReordering} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary disabled:opacity-30" aria-label={`Đưa nhóm ${item.name} xuống`}>
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            id={`edit-group-${item.id}`}
            type="button"
            onClick={onEditGroup}
            disabled={isGroupBusy}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-40"
            aria-label={`Sửa nhóm ${item.name}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={item.is_active}
            aria-label={`Trạng thái nhóm ${item.name}`}
            onClick={() => onToggleGroup(!item.is_active)}
            disabled={isGroupBusy}
            className="flex h-10 w-12 items-center justify-center rounded-full disabled:opacity-40"
          >
            <span className={cn("relative h-6 w-11 rounded-full transition-colors", item.is_active ? "bg-primary" : "bg-border")}>
              <span className={cn("absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", item.is_active && "translate-x-5")} />
            </span>
          </button>
        </div>
      </header>

      {isEditingGroup ? (
        <AddonGroupInlineForm
          item={item}
          isSubmitting={isGroupBusy}
          onDirtyChange={onDirtyChange}
          onCancel={onCancelEdit}
          onSubmit={onSaveGroup}
        />
      ) : null}

      <section className="border-t border-border/60 bg-secondary/10 p-4 sm:p-5" aria-label={`Options của ${item.name}`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-foreground">Add-on options</h3>
            <p className="text-xs text-muted-foreground">Thứ tự dưới đây cũng là thứ tự trong product modal.</p>
          </div>
          <button type="button" onClick={onCreateOption} className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium hover:bg-secondary/50">
            <Plus className="h-4 w-4" />
            Thêm option
          </button>
        </div>

        {item.options.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-background px-4 py-6 text-center text-sm text-muted-foreground">Nhóm này chưa có option.</p>
        ) : (
          <div className="space-y-2">
            {item.options.map((option, index) => (
              <AddonOptionRow
                key={option.id}
                group={item}
                option={option}
                isFirst={index === 0}
                isLast={index === item.options.length - 1}
                isEditing={editingOptionId === option.id}
                isBusy={busyKey === `option:${option.id}` || busyKey === `option-toggle:${option.id}` || isReordering}
                onEdit={() => onEditOption(option.id)}
                onCancelEdit={onCancelEdit}
                onDirtyChange={onDirtyChange}
                onToggle={(next) => onToggleOption(option.id, next)}
                onReorder={(direction) => onReorderOption(option.id, direction)}
                onSave={(payload, file, filename) => onSaveOption(option.id, payload, file, filename)}
              />
            ))}
          </div>
        )}
      </section>
    </article>
  );
}
