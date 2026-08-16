"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/src/utils/cn";
import {
  filterAdaptiveOptions,
  toggleAdaptiveValue,
  type AdaptiveSelectOption,
} from "@/src/lib/utils/adaptiveSelect";

const DESKTOP_QUERY = "(min-width: 768px)";
const subscribeDesktop = (onChange: () => void) => {
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
const getDesktop = () => window.matchMedia(DESKTOP_QUERY).matches;
const getServerDesktop = () => false;

export interface AdaptiveSelectProps {
  label: string;
  options: AdaptiveSelectOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  error?: string;
  disabled?: boolean;
}

function SelectionList({
  options,
  selected,
  multiple,
  onSelect,
}: {
  options: AdaptiveSelectOption[];
  selected: string[];
  multiple: boolean;
  onSelect: (value: string) => void;
}) {
  if (options.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">Không tìm thấy lựa chọn</p>;
  }
  return (
    <div className="max-h-[48vh] overflow-y-auto p-2" role="listbox" aria-multiselectable={multiple}>
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <button
            type="button"
            role="option"
            aria-selected={active}
            disabled={option.disabled}
            key={option.value}
            onClick={() => onSelect(option.value)}
            className={cn(
              "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left",
              active ? "bg-primary/10 text-primary" : "hover:bg-muted",
              option.disabled && "cursor-not-allowed opacity-40",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{option.label}</span>
              {option.description ? (
                <span className="block truncate text-xs text-muted-foreground">{option.description}</span>
              ) : null}
            </span>
            {active ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Searchable single/multi select rendered as a popover on desktop and bottom sheet on mobile. */
export function AdaptiveSelect({
  label,
  options,
  value,
  onChange,
  multiple = false,
  placeholder = "Chọn một mục",
  searchPlaceholder = "Tìm kiếm…",
  error,
  disabled,
}: AdaptiveSelectProps) {
  const desktop = useSyncExternalStore(subscribeDesktop, getDesktop, getServerDesktop);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const filtered = useMemo(() => filterAdaptiveOptions(options, query), [options, query]);
  const selectedLabels = options.filter((option) => selected.includes(option.value)).map((option) => option.label);

  const choose = (nextValue: string) => {
    const next = toggleAdaptiveValue(selected, nextValue, multiple);
    onChange(multiple ? next : next[0] ?? "");
    if (!multiple) setOpen(false);
  };
  const trigger = (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      aria-expanded={open}
      className={cn(
        "flex min-h-11 w-full items-center justify-between rounded-xl border bg-background px-3 text-left text-sm",
        error ? "border-destructive" : "border-input",
      )}
    >
      <span className={cn("truncate", selectedLabels.length === 0 && "text-muted-foreground")}>
        {selectedLabels.length > 0 ? selectedLabels.join(", ") : placeholder}
      </span>
      <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
    </button>
  );
  const body = (
    <>
      <div className="flex items-center gap-2 border-b px-3 py-3">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        {query ? (
          <button type="button" onClick={() => setQuery("")} className="grid h-11 w-11 place-items-center" aria-label="Xóa tìm kiếm">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <SelectionList options={filtered} selected={selected} multiple={multiple} onSelect={choose} />
      {multiple ? (
        <div className="border-t p-3">
          <button type="button" onClick={() => setOpen(false)} className="h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground">
            Xong ({selected.length})
          </button>
        </div>
      ) : null}
    </>
  );

  return (
    <div className="block space-y-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {desktop ? (
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>{trigger}</Popover.Trigger>
          <Popover.Portal>
            <Popover.Content align="start" sideOffset={6} className="z-50 w-[min(420px,var(--radix-popover-trigger-width))] rounded-xl border bg-popover shadow-xl">
              {body}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ) : (
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
            <Dialog.Content aria-describedby={undefined} className="fixed inset-x-0 bottom-0 z-50 max-h-[82vh] rounded-t-3xl bg-background pb-[env(safe-area-inset-bottom)] shadow-2xl">
              <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted" />
              <Dialog.Title className="px-4 pb-1 pt-3 text-base font-bold">{label}</Dialog.Title>
              {body}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
