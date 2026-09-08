"use client";

import { Layers3 } from "lucide-react";
import { AdaptiveSelect } from "@/src/components/shared/AdaptiveSelect";
import { useFormContext, type FieldPath } from "react-hook-form";
import {
  applyCommonBundleBaseLiquid,
  applyCommonBundleSizes,
  getBundleScopeCompatibility,
} from "@/src/lib/utils/adminVoucherBundleScopes";
import {
  createBundleScopeDraft,
  type BundleMenuConfig,
  type BundleProductScopeDraft,
  type BundleScopeSize,
} from "@/src/lib/utils/adminVoucherBundle";
import type { VoucherDraft } from "@/src/lib/utils/adminVoucherForm";
import type { AdaptiveSelectOption } from "@/src/lib/utils/adaptiveSelect";

const SIZE_OPTIONS: AdaptiveSelectOption[] = [
  { value: "SMALL", label: "Nhỏ" },
  { value: "MEDIUM", label: "Vừa" },
  { value: "LARGE", label: "Lớn" },
];

interface BundleSharedScopeEditorProps {
  label: string;
  purpose: "QUALIFIER" | "FIXED_CONFIG" | "ALLOWED_SCOPE";
  scopes: BundleProductScopeDraft[];
  menuItems: BundleMenuConfig[];
  powderOptions: AdaptiveSelectOption[];
  milkOptions: AdaptiveSelectOption[];
  onChange: (scopes: BundleProductScopeDraft[]) => void;
  scopeField: "qualifierScopes" | "rewardProductScopes";
}

/** Edits one shared drink configuration group and individual Fusion defaults. */
export function BundleSharedScopeEditor({
  label, purpose, scopes, menuItems, powderOptions, milkOptions, onChange, scopeField,
}: BundleSharedScopeEditorProps) {
  const form = useFormContext<VoucherDraft>();
  const menus = new Map(menuItems.map((menu) => [menu.id, menu]));
  const compatibility = getBundleScopeCompatibility(scopes, menuItems);
  const drinkScopes = scopes.filter((scope) => scope.category !== "extras");
  const selectedIds = scopes.map((scope) => scope.menuItemId);
  const menuName = (id: string) => menus.get(id)?.name ?? "Món đã chọn";
  const errorForPath = (path: string): string | undefined => {
    let current: unknown = form.formState.errors;
    for (const segment of path.split(".")) {
      if (typeof current !== "object" || current === null) return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
    if (typeof current !== "object" || current === null) return undefined;
    const message = (current as Record<string, unknown>).message;
    return typeof message === "string" ? message : undefined;
  };
  const triggerScope = (path = scopeField) => { void form.trigger(path as FieldPath<VoucherDraft>); };
  const updateScope = (menuItemId: string, patch: Partial<BundleProductScopeDraft>) => {
    onChange(scopes.map((scope) => scope.menuItemId === menuItemId ? { ...scope, ...patch } : scope));
  };
  const selectMenus = (value: string | string[]) => {
    const ids = new Set(Array.isArray(value) ? value : [value]);
    const nextScopes = menuItems.filter((menu) => ids.has(menu.id)).map((menu) =>
      scopes.find((scope) => scope.menuItemId === menu.id) ?? createBundleScopeDraft(menu),
    );
    if (scopes.length === 0) {
      const nextCompatibility = getBundleScopeCompatibility(nextScopes, menuItems);
      const initialized = applyCommonBundleSizes(nextScopes, nextCompatibility.commonSizes);
      const soleBaseLiquid = nextCompatibility.commonBaseLiquidIds.length === 1 ? nextCompatibility.commonBaseLiquidIds[0] : null;
      onChange(soleBaseLiquid ? applyCommonBundleBaseLiquid(initialized, soleBaseLiquid) : initialized);
      triggerScope();
      return;
    }
    onChange(nextScopes);
    triggerScope();
  };
  const scopeSelectionError = errorForPath(scopeField) ?? (purpose === "QUALIFIER" && scopes.length === 0
    ? "Vui lòng chọn ít nhất một món mua đủ điều kiện."
    : undefined);
  const sizeError = compatibility.conflictingMenuItemIds.length > 0
    ? `Lựa chọn hiện tại của ${compatibility.conflictingMenuItemIds.map(menuName).join(", ")} không còn nằm trong giao chung. Hãy chọn lại size hoặc Base Liquid.`
    : drinkScopes.length > 0 && compatibility.commonSizes.length === 0
      ? "Các món đã chọn không có size chung. Hãy đổi nhóm món hoặc chọn lại món."
      : drinkScopes.length > 0 && compatibility.selectedSizes.length === 0
        ? "Hãy chọn ít nhất một size chung cho nhóm đồ uống."
      : undefined;
  const nestedErrors = (field: "sizes" | "milkTypeIds" | "powderIds" | "fixedPowderId") => scopes.map((_, index) => errorForPath(`${scopeField}.${index}.${field}`)).filter((error): error is string => Boolean(error));
  const milkError = nestedErrors("milkTypeIds")[0] ?? (compatibility.commonBaseLiquidIds.length === 0
    ? "Các món đã chọn không có Base Liquid chung."
    : compatibility.selectedBaseLiquidId === null
      ? "Hãy chọn một Base Liquid chung cho nhóm đồ uống."
      : undefined);
  const productCountError = purpose === "FIXED_CONFIG" && scopes.length !== 1
    ? "Cấu hình cố định cần đúng một món quà. Hãy chọn lại một món."
    : undefined;
  const sizeChoices = compatibility.commonSizes
    .map((size) => SIZE_OPTIONS.find((option) => option.value === size))
    .filter((option): option is AdaptiveSelectOption => Boolean(option));
  const milkChoices = compatibility.commonBaseLiquidIds
    .map((id) => milkOptions.find((option) => option.value === id))
    .filter((option): option is AdaptiveSelectOption => Boolean(option));
  const selectedSizes = compatibility.selectedSizes;
  const selectedBaseLiquidId = compatibility.selectedBaseLiquidId ?? "";

  return (
    <section className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-3">
      <AdaptiveSelect
        label={label}
        multiple
        options={menuItems.map((menu) => ({
          value: menu.id,
          label: menu.name,
          description: menu.category === "extras" ? "Món lẻ · không có cấu hình đồ uống" : menu.category === "latte" ? "Latte · bột cố định" : "Fusion · chọn bột riêng",
        }))}
        value={selectedIds}
        error={scopeSelectionError}
        onChange={selectMenus}
      />
      {productCountError ? <p className="text-xs text-destructive">{productCountError}</p> : null}
      {drinkScopes.length > 0 ? (
        <div className="space-y-3 rounded-xl border bg-background p-3">
          <p className="text-sm font-bold">Cấu hình chung cho nhóm đồ uống</p>
          <div className="space-y-1.5">
            <span className="text-sm font-semibold">Size được áp dụng</span>
            <div className="flex flex-wrap gap-2">
              {sizeChoices.map((option) => {
                const size = option.value as BundleScopeSize;
                const active = selectedSizes.includes(size);
                return <button key={option.value} type="button" aria-pressed={active} onClick={() => {
                  const next = active ? selectedSizes.filter((selected) => selected !== size) : [...selectedSizes, size];
                  onChange(applyCommonBundleSizes(scopes, next));
                }} className={`min-h-11 min-w-16 rounded-xl border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary bg-primary/10 text-primary" : "border-input"}`}>{option.label}</button>;
              })}
            </div>
             {nestedErrors("sizes")[0] ?? sizeError ? <p className="text-xs text-destructive">{nestedErrors("sizes")[0] ?? sizeError}</p> : null}
          </div>
          <AdaptiveSelect
            label="Base Liquid mặc định cho cả nhóm"
            options={milkChoices}
            value={selectedBaseLiquidId}
            placeholder="Chọn một Base Liquid chung"
            error={milkError}
             onChange={(value) => { if (typeof value === "string" && value) { onChange(applyCommonBundleBaseLiquid(scopes, value)); triggerScope(); } }}
          />
        </div>
      ) : null}
      {scopes.map((scope, index) => {
        const menu = menus.get(scope.menuItemId);
        if (!menu) return null;
        const itemPowders = powderOptions.filter((option) => menu.availablePowderIds.includes(option.value));
        const fixedPowderName = powderOptions.find((option) => option.value === scope.fixedPowderId)?.label;
        return (
          <article key={scope.menuItemId} className="space-y-3 rounded-xl border bg-background p-3 shadow-sm">
            <p className="flex items-center gap-2 text-sm font-bold"><Layers3 className="size-4 text-primary" />{menu.name}</p>
            {scope.category === "fusion" ? (
              <AdaptiveSelect
                label="Bột mặc định cho món Fusion"
                options={itemPowders}
                value={scope.powderIds[0] ?? ""}
                 error={errorForPath(`${scopeField}.${index}.powderIds`) ?? (scope.powderIds.length === 0 ? "Hãy chọn bột mặc định hợp lệ." : undefined)}
                 onChange={(value) => { updateScope(scope.menuItemId, { powderIds: typeof value === "string" && value ? [value] : [] }); void form.trigger(`${scopeField}.${index}.powderIds` as FieldPath<VoucherDraft>); }}
              />
            ) : scope.category === "latte" ? (
              errorForPath(`${scopeField}.${index}.fixedPowderId`) ? <p className="text-xs text-destructive">{errorForPath(`${scopeField}.${index}.fixedPowderId`)}</p> : <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">Latte dùng bột cố định{fixedPowderName ? `: ${fixedPowderName}` : " của món"}.</p>
            ) : (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Món lẻ không có size, bột hoặc Base Liquid.</p>
            )}
          </article>
        );
      })}
    </section>
  );
}
