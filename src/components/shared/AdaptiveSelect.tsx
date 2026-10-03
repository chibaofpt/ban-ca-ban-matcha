"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Drawer } from "vaul";
import { cn } from "@/src/utils/cn";
import { useOverlayRegistration } from "@/src/components/ui/OverlayStackProvider";
import {
  filterAdaptiveOptions,
  toggleAdaptiveValue,
  type AdaptiveSelectOption,
} from "@/src/lib/utils/adaptiveSelect";

const DESKTOP_QUERY = "(min-width: 768px)";
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
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
  mobile,
}: {
  options: AdaptiveSelectOption[];
  selected: string[];
  multiple: boolean;
  onSelect: (value: string) => void;
  mobile: boolean;
}) {
  if (options.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">Không tìm thấy lựa chọn</p>;
  }
  return (
    <div
      className={cn("max-h-[48vh] overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none p-2", mobile && "min-h-0 flex-1")}
      role="listbox"
      aria-multiselectable={multiple}
    >
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
  const registration = useOverlayRegistration("nested", open, { deferRelease: true });
  const openRef = useRef(open);
  useIsomorphicLayoutEffect(() => {
    openRef.current = open;
  }, [open]);
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const filtered = useMemo(() => filterAdaptiveOptions(options, query), [options, query]);
  const selectedLabels = options.filter((option) => selected.includes(option.value)).map((option) => option.label);

  const requestOpenChange = (nextOpen: boolean) => {
    if (nextOpen || registration.isTopmost) {
      setOpen(nextOpen);
      if (!nextOpen) setQuery("");
    }
  };
  const choose = (nextValue: string) => {
    const next = toggleAdaptiveValue(selected, nextValue, multiple);
    onChange(multiple ? next : next[0] ?? "");
    if (!multiple) requestOpenChange(false);
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-3">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
        <input
          autoFocus={desktop}
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
      <SelectionList options={filtered} selected={selected} multiple={multiple} onSelect={choose} mobile={!desktop} />
      {multiple ? (
        <div className="border-t p-3">
          <button type="button" onClick={() => requestOpenChange(false)} className="h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground">
            Đóng ({selected.length} đã chọn)
          </button>
        </div>
      ) : null}
    </div>
  );
  const nestedMobile = registration.managed && registration.parent?.supportsNestedDrawer === true;
  const popoverLayerClass = registration.managed && registration.parent ? "z-[100]" : "z-50";
  const MobileDrawerRoot = nestedMobile ? Drawer.NestedRoot : Drawer.Root;
  const visualZIndex = registration.visualZIndex;
  const handleCloseAutoFocus = () => {
    queueMicrotask(() => {
      if (!openRef.current) registration.release();
    });
  };

  return (
    <div className="block space-y-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {desktop ? (
        <Popover.Root open={open} onOpenChange={requestOpenChange}>
          <Popover.Trigger asChild>{trigger}</Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={6}
              onEscapeKeyDown={(event) => {
                if (!registration.isTopmost) event.preventDefault();
              }}
              onPointerDownOutside={(event) => {
                if (!registration.isTopmost) event.preventDefault();
              }}
              onCloseAutoFocus={handleCloseAutoFocus}
              style={visualZIndex === undefined ? undefined : { zIndex: visualZIndex + 1 }}
              className={cn(popoverLayerClass, "w-[min(420px,var(--radix-popover-trigger-width))] rounded-xl border bg-popover shadow-xl")}
            >
              {body}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ) : (
        <MobileDrawerRoot open={open} onOpenChange={requestOpenChange} autoFocus={false} dismissible={registration.isTopmost} repositionInputs>
          <Drawer.Trigger asChild>{trigger}</Drawer.Trigger>
          <Drawer.Portal>
            <Drawer.Overlay
              style={visualZIndex === undefined ? undefined : { zIndex: visualZIndex }}
              className="fixed inset-0 z-[90] bg-foreground/20"
            />
            <Drawer.Content
              onCloseAutoFocus={handleCloseAutoFocus}
              style={visualZIndex === undefined ? undefined : { zIndex: visualZIndex + 1 }}
              className="fixed inset-x-0 bottom-0 z-[100] flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl bg-background pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none"
            >
              <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-muted" />
              <Drawer.Title className="shrink-0 px-4 pb-1 pt-3 text-base font-bold">{label}</Drawer.Title>
              <Drawer.Description className="sr-only">Tìm kiếm và chọn {label.toLocaleLowerCase("vi-VN")}</Drawer.Description>
              {body}
            </Drawer.Content>
          </Drawer.Portal>
        </MobileDrawerRoot>
      )}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
