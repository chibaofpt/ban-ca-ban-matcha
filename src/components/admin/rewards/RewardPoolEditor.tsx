"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/src/components/ui/button";
import type { VoucherPackage } from "@/src/services/adminVoucherService";
import type { AdminRewardCampaign, AdminRewardPoolInput } from "@/src/services/adminRewardService";
import { getAdminRewardPoolFeedback, isAdminRewardPackageAvailable } from "@/src/utils/adminRewardPool";

interface RewardPoolEditorProps {
  campaign: AdminRewardCampaign;
  packages: VoucherPackage[];
  saving: boolean;
  onSave: (items: AdminRewardPoolInput[]) => Promise<void>;
}

/** Edit a draft campaign's weighted voucher pool with local reachability feedback. */
export function RewardPoolEditor({ campaign, packages, saving, onSave }: RewardPoolEditorProps) {
  const [items, setItems] = useState<AdminRewardPoolInput[]>(() => campaign.pool_items.map((item) => ({ voucher_package_id: item.voucher_package_id, quantity: item.quantity, unlock_after_draws: item.unlock_after_draws })));
  const available = useMemo(() => packages.filter((pkg) => isAdminRewardPackageAvailable(pkg) || items.some((item) => item.voucher_package_id === pkg.id)), [items, packages]);
  const feedback = getAdminRewardPoolFeedback(items);
  const editable = campaign.status === "DRAFT";
  const valid = !feedback.warning && items.every((item) => available.some((pkg) => pkg.id === item.voucher_package_id && isAdminRewardPackageAvailable(pkg)));

  const update = (index: number, patch: Partial<AdminRewardPoolInput>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const add = () => {
    const used = new Set(items.map((item) => item.voucher_package_id));
    const next = available.find((pkg) => !used.has(pkg.id));
    if (next) setItems((current) => [...current, { voucher_package_id: next.id, quantity: 1, unlock_after_draws: 0 }]);
  };

  return (
    <section className="space-y-4" aria-labelledby="reward-pool-title">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 id="reward-pool-title" className="font-bold">Pool voucher</h3><p className="text-sm text-muted-foreground">Tổng phân bổ: {feedback.total.toLocaleString("vi-VN")}</p></div><Button variant="outline" onClick={add} disabled={!editable || items.length >= available.length || items.length >= 100}><Plus className="size-4" /> Thêm voucher</Button></div>
      {items.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Chưa có voucher trong pool.</p> : (
        <div className="space-y-3">
          {items.map((item, index) => {
            const live = campaign.pool_items.find((row) => row.voucher_package_id === item.voucher_package_id);
            return (
              <div key={`${item.voucher_package_id}-${index}`} className="grid gap-3 rounded-xl border p-3 md:grid-cols-[minmax(12rem,1fr)_minmax(16rem,18rem)_auto] md:items-end">
                <label className="text-sm font-medium">Voucher
                  <select value={item.voucher_package_id} disabled={!editable} onChange={(event) => update(index, { voucher_package_id: event.target.value })} className="mt-1 h-11 w-full rounded-lg border bg-background px-3">
                    {available.map((pkg) => { const packageAvailable = isAdminRewardPackageAvailable(pkg); return <option key={pkg.id} value={pkg.id} disabled={!packageAvailable || items.some((row, rowIndex) => rowIndex !== index && row.voucher_package_id === pkg.id)}>{pkg.name}{packageAvailable ? "" : " (không còn khả dụng — đang trong pool)"}</option>; })}
                  </select>
                </label>
                <div className="grid min-w-0 grid-cols-2 gap-3">
                  <label className="min-w-0 text-sm font-medium">Số lượng<input type="number" min={1} max={10000} value={item.quantity} disabled={!editable} onChange={(event) => update(index, { quantity: Number(event.target.value) })} className="mt-1 h-11 w-full min-w-0 rounded-lg border bg-background px-3" /></label>
                  <label className="min-w-0 text-sm font-medium">Mở sau lượt<input type="number" min={0} max={99999} value={item.unlock_after_draws} disabled={!editable} onChange={(event) => update(index, { unlock_after_draws: Number(event.target.value) })} className="mt-1 h-11 w-full min-w-0 rounded-lg border bg-background px-3" /></label>
                </div>
                <Button variant="ghost" size="icon" aria-label="Xóa voucher khỏi pool" disabled={!editable} onClick={() => setItems((current) => current.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="size-4 text-destructive" /></Button>
                {live ? <p className="text-xs text-muted-foreground md:col-span-3">Đã phát {live.issued_count} · Còn {live.remaining_quantity} · Trọng số {live.current_weight}/{live.eligible_weight_total}</p> : null}
              </div>
            );
          })}
        </div>
      )}
      {feedback.warning ? <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{feedback.warning} Server sẽ kiểm tra lại khi lưu.</p> : null}
      {!feedback.warning && !valid ? <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Pool đang chứa voucher không còn khả dụng. Hãy chọn voucher khác trước khi lưu.</p> : null}
      {editable ? <div className="flex justify-end"><Button disabled={!valid || saving} onClick={() => void onSave(items)}>{saving ? "Đang lưu…" : "Lưu pool"}</Button></div> : <p className="text-sm text-muted-foreground">Pool chỉ chỉnh sửa khi campaign ở trạng thái DRAFT.</p>}
    </section>
  );
}
