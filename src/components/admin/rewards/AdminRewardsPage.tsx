"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, RefreshCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { RewardCampaignEditor } from "@/src/components/admin/rewards/RewardCampaignEditor";
import { RewardSettingsPanel } from "@/src/components/admin/rewards/RewardSettingsPanel";
import { ADMIN_REWARD_QUERY_KEYS } from "@/src/constants/adminRewardQueryKeys";
import { useAdminRewardCampaign, useAdminRewardMutations, useAdminRewardOverview } from "@/src/hooks/useAdminRewards";
import { ApiServiceError } from "@/src/services/orderService";
import { listVoucherPackages } from "@/src/services/adminVoucherService";
import type { AdminRewardBoxCreateInput, AdminRewardBoxUpdateInput, AdminRewardCampaignAction, AdminRewardPoolInput, AdminWelcomeRewardSettings } from "@/src/services/adminRewardService";
import { cn } from "@/src/utils/cn";

function errorText(error: unknown): string {
  return error instanceof ApiServiceError ? error.message : "Không thể cập nhật phần thưởng lúc này.";
}

/** Render the admin welcome-reward settings and campaign workspace inside its owning surface. */
export function AdminRewardsPage() {
  const { settings, campaigns } = useAdminRewardOverview();
  const packages = useQuery({ queryKey: ADMIN_REWARD_QUERY_KEYS.VOUCHER_PACKAGES, queryFn: listVoucherPackages });
  const mutations = useAdminRewardMutations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const items = campaigns.data ?? [];
  const effectiveSelectedId = selectedId && items.some((item) => item.id === selectedId) ? selectedId : items[0]?.id ?? null;
  const detail = useAdminRewardCampaign(effectiveSelectedId);

  const reconcileConflict = async (error: unknown, scope: "settings" | "campaign"): Promise<boolean> => {
    if (!(error instanceof ApiServiceError) || error.status !== 409) return false;
    if (scope === "settings") await settings.refetch();
    else await Promise.all([detail.refetch(), campaigns.refetch()]);
    toast.error("Dữ liệu đã thay đổi ở nơi khác. Bản mới nhất đã được tải; vui lòng kiểm tra và nhập lại.");
    return true;
  };
  const handleError = async (error: unknown, scope: "settings" | "campaign") => {
    if (!(await reconcileConflict(error, scope))) toast.error(errorText(error));
  };

  const saveSettings = async (input: AdminWelcomeRewardSettings) => {
    try { await mutations.settings.mutateAsync(input); toast.success("Đã lưu cấu hình quà chào mừng."); }
    catch (error: unknown) { await handleError(error, "settings"); }
  };
  const createCampaign = async () => {
    if (!newName.trim()) return;
    try {
      const created = await mutations.createCampaign.mutateAsync({ name: newName.trim() });
      setNewName(""); setSelectedId(created.id); toast.success("Đã tạo campaign bản nháp.");
    } catch (error: unknown) { await handleError(error, "campaign"); }
  };
  const campaignAction = async (input: AdminRewardCampaignAction): Promise<boolean> => {
    if (!effectiveSelectedId) return false;
    try { await mutations.campaign.mutateAsync({ id: effectiveSelectedId, input }); toast.success("Đã cập nhật campaign."); return true; }
    catch (error: unknown) { await handleError(error, "campaign"); return false; }
  };
  const savePool = async (poolItems: AdminRewardPoolInput[]) => {
    if (!effectiveSelectedId || !detail.data) return;
    try { await mutations.pool.mutateAsync({ id: effectiveSelectedId, revision: detail.data.revision, items: poolItems }); toast.success("Đã lưu pool voucher."); }
    catch (error: unknown) { await handleError(error, "campaign"); }
  };
  const createBox = async (input: AdminRewardBoxCreateInput): Promise<boolean> => {
    if (!effectiveSelectedId) return false;
    try { await mutations.createBox.mutateAsync({ id: effectiveSelectedId, input }); toast.success("Đã thêm hộp matcha."); return true; }
    catch (error: unknown) { await handleError(error, "campaign"); return false; }
  };
  const updateBox = async (boxId: string, input: AdminRewardBoxUpdateInput): Promise<boolean> => {
    if (!effectiveSelectedId) return false;
    try { await mutations.updateBox.mutateAsync({ id: effectiveSelectedId, boxId, input }); toast.success("Đã cập nhật hộp."); return true; }
    catch (error: unknown) { await handleError(error, "campaign"); return false; }
  };
  const deleteBox = async (boxId: string): Promise<boolean> => {
    if (!effectiveSelectedId || !detail.data) return false;
    try { await mutations.deleteBox.mutateAsync({ id: effectiveSelectedId, boxId, revision: detail.data.revision }); toast.success("Đã xóa hộp."); return true; }
    catch (error: unknown) { await handleError(error, "campaign"); return false; }
  };

  const loading = settings.isLoading || campaigns.isLoading || packages.isLoading;
  const failed = settings.isError || campaigns.isError || packages.isError;
  const busy = Object.values(mutations).some((mutation) => mutation.isPending);
  if (loading) return <div className="mx-auto flex min-h-80 max-w-7xl items-center justify-center px-4" aria-busy="true"><Loader2 className="size-6 animate-spin" /><span className="sr-only">Đang tải quản lý phần thưởng</span></div>;
  if (failed || !settings.data || !packages.data) return <div className="mx-auto max-w-3xl px-4 py-12 text-center"><p role="alert">Không thể tải dữ liệu phần thưởng.</p><Button className="mt-4" variant="outline" onClick={() => void Promise.all([settings.refetch(), campaigns.refetch(), packages.refetch()])}><RefreshCcw className="size-4" /> Thử lại</Button></div>;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 overflow-x-clip">
      <RewardSettingsPanel key={settings.data.revision} settings={settings.data} packages={packages.data} campaigns={items} saving={mutations.settings.isPending} onSave={saveSettings} />
      <section className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="space-y-3 rounded-2xl border bg-card p-4">
          <h2 className="font-bold">Campaign</h2>
          <label className="block text-sm font-medium" htmlFor="new-reward-campaign">Tên campaign mới</label><div className="flex gap-2"><input id="new-reward-campaign" value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={100} placeholder="Ví dụ: Quà tháng 9" className="h-11 min-w-0 flex-1 rounded-xl border bg-background px-3" /><Button size="icon" aria-label="Tạo campaign" disabled={!newName.trim() || mutations.createCampaign.isPending} onClick={() => void createCampaign()}><Plus className="size-4" /></Button></div>
          {items.length === 0 ? <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Chưa có campaign. Tạo bản nháp đầu tiên để bắt đầu.</p> : <div className="space-y-2">{items.map((campaign) => <button key={campaign.id} type="button" onClick={() => setSelectedId(campaign.id)} className={cn("min-h-14 w-full rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", effectiveSelectedId === campaign.id ? "border-primary bg-primary/5" : "hover:bg-secondary/20")}><span className="block truncate font-semibold">{campaign.name}</span><span className="text-xs text-muted-foreground">{campaign.status} · {campaign.box_count} hộp · còn {campaign.total_remaining}</span></button>)}</div>}
        </aside>
        <div className="min-w-0">{effectiveSelectedId && detail.isLoading ? <div className="flex min-h-60 items-center justify-center rounded-2xl border"><Loader2 className="size-5 animate-spin" /></div> : detail.isError ? <div className="rounded-2xl border p-8 text-center"><p role="alert">Không thể tải chi tiết campaign.</p><Button variant="outline" className="mt-3" onClick={() => void detail.refetch()}>Thử lại</Button></div> : detail.data ? <RewardCampaignEditor key={`${detail.data.id}-${detail.data.revision}`} campaign={detail.data} packages={packages.data} busy={busy} onAction={campaignAction} onPoolSave={savePool} onBoxCreate={createBox} onBoxUpdate={updateBox} onBoxDelete={deleteBox} /> : <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Chọn hoặc tạo campaign để chỉnh sửa.</div>}</div>
      </section>
    </div>
  );
}
