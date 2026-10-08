"use client";
import { useState } from "react";
import type { FusionPowderReplacement, FusionPowderReplacementDetails } from "@/contracts/admin/catalog";
import { AdaptiveSelect } from "@/src/components/shared/AdaptiveSelect";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import { Button } from "@/src/components/ui/button";

interface Props {
  details: FusionPowderReplacementDetails;
  busy: boolean;
  error: string | null;
  onConfirm: (replacements: FusionPowderReplacement[]) => Promise<void>;
  onCancel: () => void;
}

/** Collect complete explicit replacement choices using the shared mobile sheet/desktop dialog. */
export function FusionPowderReplacementSheet({ details, busy, error, onConfirm, onCancel }: Props) {
  const [individual, setIndividual] = useState(false);
  const [common, setCommon] = useState("");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const options = details.available_powders.filter((powder) => powder.id !== details.powder_id)
    .map((powder) => ({ value: powder.id, label: powder.name }));
  const valid = (value: string) => options.some((option) => option.value === value);
  const complete = options.length > 0 && details.fusion_items.every((item) => valid(individual ? choices[item.id] ?? "" : common));
  const mappings = details.fusion_items.map((item) => ({ menu_item_id: item.id, replacement_powder_id: individual ? choices[item.id] ?? "" : common }));
  return (
    <ResponsiveOverlay open title="Chọn bột thay thế cho Fusion"
      description="Những món Fusion liên quan cần bột thay thế trước khi ngưng bán. Bột gốc vẫn được giữ làm mốc tính giá."
      layer="nested" busy={busy} dismissPolicy="locked-while-busy" onOpenChange={(open) => { if (!open) onCancel(); }}
      footer={<div className="flex gap-3"><Button variant="outline" className="flex-1" disabled={busy} onClick={onCancel}>Hủy</Button><Button className="flex-1" disabled={busy || !complete} onClick={() => void onConfirm(mappings)}>{busy ? "Đang lưu..." : "Xác nhận ngưng bán"}</Button></div>}>
      <div className="space-y-4">
        {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {options.length === 0 && <p role="alert" className="text-sm text-destructive">Chưa có bột đang bán để thay thế. Không thể ngưng bán lúc này.</p>}
        {!individual && <AdaptiveSelect label="Bột thay thế chung" options={options} value={common}
          onChange={(value) => setCommon(String(value))} disabled={busy || options.length === 0}
          placeholder="Chọn bột đang bán" error={common && !valid(common) ? "Bột đã ngưng bán. Vui lòng chọn lại." : undefined} />}
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
          <input type="checkbox" checked={individual} disabled={busy} className="h-4 w-4 accent-primary"
            onChange={(event) => {
              const next = event.target.checked;
              if (next) setChoices((old) => Object.fromEntries(details.fusion_items.map((item) => [item.id, old[item.id] ?? common])));
              setIndividual(next);
            }} />
          Cấu hình riêng từng món
        </label>
        {individual && <div className="space-y-3">
          {details.fusion_items.map((item) => <div key={item.id} className="rounded-xl border border-border p-3">
            <p className="text-sm font-semibold">{item.name}</p>
            <p className="mb-2 text-xs text-muted-foreground">{item.is_available ? "Đang bán" : "Tạm ngưng bán"}</p>
            <AdaptiveSelect label={"Bột thay thế cho " + item.name} options={options} value={choices[item.id] ?? ""}
              onChange={(value) => setChoices((old) => ({ ...old, [item.id]: String(value) }))}
              placeholder="Chọn bột đang bán" disabled={busy || options.length === 0}
              error={(choices[item.id] || error) && !valid(choices[item.id] ?? "") ? "Vui lòng chọn lại bột đang bán cho món này." : undefined} />
          </div>)}
        </div>}
      </div>
    </ResponsiveOverlay>
  );
}
