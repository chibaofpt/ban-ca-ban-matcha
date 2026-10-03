"use client";

import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import type { VoucherPackage } from "@/src/services/adminVoucherService";
import type { AdminRewardBoxCreateInput, AdminRewardBoxUpdateInput, AdminRewardCampaign, AdminRewardCampaignAction, AdminRewardPoolInput } from "@/src/services/adminRewardService";
import { getAdminRewardPoolFeedback, isAdminRewardPackageAvailable } from "@/src/utils/adminRewardPool";
import { RewardBoxEditor } from "@/src/components/admin/rewards/RewardBoxEditor";
import { RewardPoolEditor } from "@/src/components/admin/rewards/RewardPoolEditor";
import { cn } from "@/src/utils/cn";

type EditorTab = "general" | "pool" | "boxes";

interface RewardCampaignEditorProps {
  campaign: AdminRewardCampaign;
  packages: VoucherPackage[];
  busy: boolean;
  onAction: (input: AdminRewardCampaignAction) => Promise<boolean>;
  onPoolSave: (items: AdminRewardPoolInput[]) => Promise<void>;
  onBoxCreate: (input: AdminRewardBoxCreateInput) => Promise<boolean>;
  onBoxUpdate: (boxId: string, input: AdminRewardBoxUpdateInput) => Promise<boolean>;
  onBoxDelete: (boxId: string) => Promise<boolean>;
}

const STATUS_LABEL: Record<AdminRewardCampaign["status"], string> = { DRAFT: "Bản nháp", ACTIVE: "Đang chạy", PAUSED: "Tạm dừng", ENDED: "Đã kết thúc" };

/** Compose campaign general, pool and box editors around one revision snapshot. */
export function RewardCampaignEditor({ campaign, packages, busy, onAction, onPoolSave, onBoxCreate, onBoxUpdate, onBoxDelete }: RewardCampaignEditorProps) {
  const [tab, setTab] = useState<EditorTab>("general");
  const [name, setName] = useState(campaign.name);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const poolFeedback = getAdminRewardPoolFeedback(campaign.pool_items.map((item) => ({ voucher_package_id: item.voucher_package_id, quantity: item.quantity, unlock_after_draws: item.unlock_after_draws })));
  const ready = campaign.box_count >= 3 && campaign.box_count <= 12 && !poolFeedback.warning && campaign.pool_items.every((item) => isAdminRewardPackageAvailable(item.voucher_package));
  const action = (value: AdminRewardCampaignAction["action"]) => {
    if (value === "RENAME") return onAction({ action: value, revision: campaign.revision, name: name.trim() });
    return onAction({ action: value, revision: campaign.revision });
  };

  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b p-4 md:p-5">
        <div><div className="flex items-center gap-2"><h2 className="text-xl font-bold">{campaign.name}</h2><span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold">{STATUS_LABEL[campaign.status]}</span></div><p className="mt-1 text-sm text-muted-foreground">Revision {campaign.revision} · {campaign.draw_count} lượt mở</p></div>
        <div className="flex flex-wrap gap-2">
          {campaign.status === "DRAFT" ? <Button disabled={!ready || busy} onClick={() => void action("ACTIVATE")}>Kích hoạt</Button> : null}
          {campaign.status === "ACTIVE" ? <><Button variant="outline" disabled={busy} onClick={() => void action("PAUSE")}>Tạm dừng</Button><Button variant="destructive" disabled={busy} onClick={() => setConfirmEnd(true)}>Kết thúc</Button></> : null}
          {campaign.status === "PAUSED" ? <><Button disabled={!ready || busy} onClick={() => void action("RESUME")}>Tiếp tục</Button><Button variant="destructive" disabled={busy} onClick={() => setConfirmEnd(true)}>Kết thúc</Button></> : null}
        </div>
      </header>
      <nav aria-label="Phần cấu hình campaign" className="grid grid-cols-3 border-b">
        {([['general', 'Chung'], ['pool', 'Pool'], ['boxes', `Hộp (${campaign.box_count})`]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={cn("min-h-11 border-b-2 px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === value ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>{label}</button>)}
      </nav>
      <div className="p-4 md:p-5">
        {tab === "general" ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3"><Stat label="Đã phân bổ" value={campaign.total_allocated} /><Stat label="Còn lại" value={campaign.total_remaining} /><Stat label="Số hộp" value={campaign.box_count} /></div>
            {campaign.status === "DRAFT" ? <div className="flex flex-col gap-2 sm:flex-row sm:items-end"><label className="flex-1 text-sm font-medium">Tên campaign<input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} className="mt-1 h-11 w-full rounded-xl border bg-background px-3" /></label><Button variant="outline" disabled={busy || !name.trim() || name.trim() === campaign.name} onClick={() => void action("RENAME")}>Đổi tên</Button></div> : null}
            {!ready && campaign.status === "DRAFT" ? <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Cần ít nhất một voucher hợp lệ, pool có thể đạt mọi mốc mở, và 3–12 hộp trước khi kích hoạt.</p> : null}
          </div>
        ) : tab === "pool" ? <RewardPoolEditor key={campaign.revision} campaign={campaign} packages={packages} saving={busy} onSave={onPoolSave} /> : <RewardBoxEditor key={campaign.revision} campaign={campaign} saving={busy} onCreate={onBoxCreate} onUpdate={onBoxUpdate} onDelete={onBoxDelete} />}
      </div>
      <ConfirmModal isOpen={confirmEnd} title="Kết thúc campaign" message="Campaign đã kết thúc không thể mở lại. Các entitlement đang chờ sẽ được server xử lý theo trạng thái hiện hành." confirmLabel="Kết thúc" isDestructive isLoading={busy} onCancel={() => setConfirmEnd(false)} onConfirm={() => void action("END").then((ended) => { if (ended) setConfirmEnd(false); })} />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-secondary/30 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{value.toLocaleString("vi-VN")}</p></div>;
}
