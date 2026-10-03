"use client";

import Image from "next/image";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import type { AdminRewardBox, AdminRewardBoxCreateInput, AdminRewardBoxUpdateInput, AdminRewardCampaign } from "@/src/services/adminRewardService";
import { RewardBoxForm } from "@/src/components/admin/rewards/RewardBoxForm";

type EditTarget = AdminRewardBox | "new" | null;

interface RewardBoxEditorProps {
  campaign: AdminRewardCampaign;
  saving: boolean;
  onCreate: (input: AdminRewardBoxCreateInput) => Promise<boolean>;
  onUpdate: (boxId: string, input: AdminRewardBoxUpdateInput) => Promise<boolean>;
  onDelete: (boxId: string) => Promise<boolean>;
}

/** Manage campaign box images and normalized mouth anchors. */
export function RewardBoxEditor({ campaign, saving, onCreate, onUpdate, onDelete }: RewardBoxEditorProps) {
  const [target, setTarget] = useState<EditTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminRewardBox | null>(null);
  const current = target === "new" || target === null ? null : target;
  const structureEditable = campaign.status === "DRAFT";
  const boxEditable = campaign.status !== "ENDED";

  return (
    <section className="space-y-4" aria-labelledby="reward-box-title">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 id="reward-box-title" className="font-bold">Hộp matcha</h3><p className="text-sm text-muted-foreground">{campaign.box_count}/12 hộp · cần 3–12 hộp để kích hoạt</p></div><Button variant="outline" disabled={!structureEditable || campaign.box_count >= 12} onClick={() => setTarget("new")}><Plus className="size-4" /> Thêm hộp</Button></div>
      {campaign.boxes.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Chưa có hộp nào.</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaign.boxes.map((box) => (
            <article key={box.id} className="rounded-2xl border bg-card p-3">
              <div className="grid grid-cols-2 gap-2">
                {[box.closed_image_url, box.open_image_url].map((src, index) => <div key={src} className="relative aspect-square overflow-hidden rounded-xl bg-muted"><Image src={src} alt={`${box.name} ${index === 0 ? "đóng" : "mở"}`} fill sizes="160px" className="object-contain" /></div>)}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2"><div><h4 className="font-semibold">{box.name}</h4><p className="text-xs text-muted-foreground">Ngang {Math.round(box.mouth_anchor_x * 100)}% · Dọc {Math.round(box.mouth_anchor_y * 100)}%</p></div>{boxEditable ? <div className="flex"><Button variant="ghost" size="icon" aria-label={`Sửa ${box.name}`} onClick={() => setTarget(box)}><Pencil className="size-4" /></Button>{structureEditable ? <Button variant="ghost" size="icon" aria-label={`Xóa ${box.name}`} onClick={() => setDeleteTarget(box)}><Trash2 className="size-4 text-destructive" /></Button> : null}</div> : null}</div>
            </article>
          ))}
        </div>
      )}

      <ResponsiveOverlay open={target !== null} title={current ? `Sửa ${current.name}` : "Thêm hộp matcha"} description="Cấu hình ảnh và vị trí miệng hộp." size="md" layer="critical" onOpenChange={(open) => { if (!open && !saving) setTarget(null); }}>
        {target ? <RewardBoxForm key={current?.id ?? "new"} current={current} campaignStatus={campaign.status} revision={campaign.revision} saving={saving} onCancel={() => setTarget(null)} onCreate={onCreate} onUpdate={onUpdate} /> : null}
      </ResponsiveOverlay>
      <ConfirmModal isOpen={deleteTarget !== null} title="Xóa hộp matcha" message={`Xóa ${deleteTarget?.name ?? "hộp này"}? Ảnh sẽ được gỡ khỏi campaign.`} confirmLabel="Xóa hộp" isDestructive isLoading={saving} onCancel={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) void onDelete(deleteTarget.id).then((deleted) => { if (deleted) setDeleteTarget(null); }); }} />
    </section>
  );
}
