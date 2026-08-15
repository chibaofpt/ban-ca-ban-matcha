"use client";

import { Layers3 } from "lucide-react";
import { AdaptiveSelect } from "@/src/components/shared/AdaptiveSelect";
import {
  createBundleScopeDraft,
  type BundleMenuConfig,
  type BundleProductScopeDraft,
  type BundleScopeSize,
} from "@/src/lib/utils/adminVoucherBundle";
import type { AdaptiveSelectOption } from "@/src/lib/utils/adaptiveSelect";

const SIZE_OPTIONS: AdaptiveSelectOption[] = [
  { value: "SMALL", label: "Nhỏ" },
  { value: "MEDIUM", label: "Vừa" },
  { value: "LARGE", label: "Lớn" },
];

interface BundleScopeEditorProps {
  label: string;
  purpose: "QUALIFIER" | "FIXED_CONFIG" | "ALLOWED_SCOPE";
  scopes: BundleProductScopeDraft[];
  menuItems: BundleMenuConfig[];
  powderOptions: AdaptiveSelectOption[];
  milkOptions: AdaptiveSelectOption[];
  onChange: (scopes: BundleProductScopeDraft[]) => void;
}

/** Edit BUNDLE product constraints independently for every selected menu item. */
export function BundleScopeEditor({
  label, purpose, scopes, menuItems, powderOptions, milkOptions, onChange,
}: BundleScopeEditorProps) {
  const menus = new Map(menuItems.map((menu) => [menu.id, menu]));
  const updateScope = (menuItemId: string, patch: Partial<BundleProductScopeDraft>) => {
    onChange(scopes.map((scope) => scope.menuItemId === menuItemId ? { ...scope, ...patch } : scope));
  };
  const selectMenus = (value: string | string[]) => {
    const ids = Array.isArray(value) ? value : [value];
    onChange(ids.flatMap((id) => {
      const existing = scopes.find((scope) => scope.menuItemId === id);
      const menu = menus.get(id);
      return existing ? [existing] : menu ? [createBundleScopeDraft(menu)] : [];
    }));
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-3">
      <AdaptiveSelect
        label={label}
        multiple
        options={menuItems.map((menu) => ({
          value: menu.id,
          label: menu.name,
          description: menu.category === "latte" ? "Latte · bột cố định" : "Fusion · chọn được bột",
        }))}
        value={scopes.map((scope) => scope.menuItemId)}
        onChange={selectMenus}
      />
      {scopes.map((scope) => {
        const menu = menus.get(scope.menuItemId);
        if (!menu) return null;
        const sizeOptions = SIZE_OPTIONS.filter((option) => menu.availableSizes.includes(option.value as BundleScopeSize));
        const allowedPowders = new Set(menu.availablePowderIds);
        const itemPowders = powderOptions.filter((option) => allowedPowders.has(option.value));
        const allowedBaseLiquids = new Set(menu.availableBaseLiquidIds);
        const itemBaseLiquids = milkOptions.filter((option) => allowedBaseLiquids.has(option.value));
        const fixedPowderName = powderOptions.find((option) => option.value === scope.fixedPowderId)?.label;
        return (
          <article key={scope.menuItemId} className="space-y-3 rounded-xl border bg-background p-3 shadow-sm">
            <p className="flex items-center gap-2 text-sm font-bold"><Layers3 className="size-4 text-primary" />{menu.name}</p>
            <AdaptiveSelect
              label={purpose === "FIXED_CONFIG" ? "Size quà (bắt buộc)" : "Size áp dụng (trống = mọi size)"}
              multiple options={sizeOptions} value={scope.sizes}
              onChange={(value) => updateScope(scope.menuItemId, { sizes: value as BundleScopeSize[] })}
            />
            {scope.category === "fusion" ? (
              <AdaptiveSelect
                label={purpose === "FIXED_CONFIG" ? "Bột được nhận (bắt buộc)" : "Bột áp dụng (trống = mọi bột hợp lệ)"}
                multiple options={itemPowders} value={scope.powderIds}
                onChange={(value) => updateScope(scope.menuItemId, { powderIds: value as string[] })}
              />
            ) : (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                Latte dùng bột cố định{fixedPowderName ? `: ${fixedPowderName}` : " của món"}; không cần chọn bột.
              </p>
            )}
            {itemBaseLiquids.length > 0 && (
              <AdaptiveSelect
                label={purpose === "FIXED_CONFIG" ? "Base Liquid quà (bắt buộc)" : "Base Liquid áp dụng (trống = mọi loại hợp lệ)"}
                multiple options={itemBaseLiquids} value={scope.milkTypeIds}
                onChange={(value) => updateScope(scope.menuItemId, { milkTypeIds: value as string[] })}
              />
            )}
            {purpose === "ALLOWED_SCOPE" && (
              <label className="space-y-1.5">
                <span className="text-sm font-semibold">Hạn mức miễn cho món này (VND)</span>
                <input type="number" min={1_000} step={1_000} value={scope.referencePriceVnd}
                  onChange={(event) => updateScope(scope.menuItemId, { referencePriceVnd: Number(event.target.value) || 0 })}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" />
              </label>
            )}
          </article>
        );
      })}
    </section>
  );
}
