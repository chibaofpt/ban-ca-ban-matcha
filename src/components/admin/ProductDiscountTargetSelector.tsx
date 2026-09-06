"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { BundleMenuConfig, BundleScopeSize } from "@/src/lib/utils/adminVoucherBundle";

interface Props {
  items: BundleMenuConfig[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

/** Select explicit PRODUCT_DISCOUNT targets and expose their shared active sizes. */
export function ProductDiscountTargetSelector({ items, selectedIds, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"ALL" | "latte" | "fusion">("ALL");
  const [excludeSeasonal, setExcludeSeasonal] = useState(false);
  const drinks = items.filter((item) => item.category !== "extras");
  const filtered = drinks.filter((item) =>
    (category === "ALL" || item.category === category) &&
    (!excludeSeasonal || !item.isSeasonal) && item.name.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")));
  const selected = drinks.filter((item) => selectedIds.includes(item.id));
  const sharedSizes = useMemo(() => {
    if (selected.length === 0) return [];
    return (["SMALL", "MEDIUM", "LARGE"] as BundleScopeSize[]).filter((size) =>
      selected.every((item) => item.availableSizes.includes(size)));
  }, [selected]);
  const toggle = (id: string) => selectedIds.includes(id)
    ? onChange(selectedIds.filter((value) => value !== id))
    : selectedIds.length < 100 && onChange([...selectedIds, id]);
  const selectFiltered = () => onChange([...new Set([...selectedIds, ...filtered.map((item) => item.id)])].slice(0, 100));

  return <div className="space-y-3">
    <div className="flex items-center gap-2 rounded-xl border px-3"><Search className="h-4 w-4" /><label className="sr-only" htmlFor="product-discount-search">Tìm sản phẩm</label><input id="product-discount-search" className="h-11 min-w-0 flex-1 bg-transparent outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm Latte hoặc Fusion" /></div>
    <div className="flex flex-wrap gap-2">{(["ALL", "latte", "fusion"] as const).map((value) => <button key={value} type="button" onClick={() => setCategory(value)} className={`min-h-11 rounded-xl border px-3 ${category === value ? "border-primary bg-primary/5" : "border-input"}`}>{value === "ALL" ? "Tất cả" : value === "latte" ? "Latte" : "Fusion"}</button>)}<button type="button" aria-pressed={excludeSeasonal} onClick={() => setExcludeSeasonal((value) => !value)} className={`min-h-11 rounded-xl border px-3 ${excludeSeasonal ? "border-primary bg-primary/5" : "border-input"}`}>Không theo mùa</button></div>
    <div className="flex items-center justify-between text-sm"><strong>Đã chọn {selectedIds.length}/100</strong><button type="button" onClick={selectFiltered} className="min-h-11 rounded-xl border px-3">Chọn tất cả đang lọc</button></div>
    {selected.length > 0 ? <div className="flex flex-wrap gap-2">{selected.map((item) => <button key={item.id} type="button" onClick={() => toggle(item.id)} className="flex min-h-11 items-center gap-2 rounded-xl bg-muted px-3">{item.name}<X className="h-4 w-4" /></button>)}</div> : null}
    <div className="max-h-56 space-y-1 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none rounded-xl border p-2">{filtered.map((item) => <label key={item.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-muted"><input type="checkbox" checked={selectedIds.includes(item.id)} disabled={!selectedIds.includes(item.id) && selectedIds.length >= 100} onChange={() => toggle(item.id)} /><span className="flex-1">{item.name}</span><span className="text-xs text-muted-foreground">{item.category}</span></label>)}</div>
    <p className="text-sm text-muted-foreground">Size dùng chung: {sharedSizes.length ? sharedSizes.join(", ") : "Không có"}</p>
  </div>;
}
