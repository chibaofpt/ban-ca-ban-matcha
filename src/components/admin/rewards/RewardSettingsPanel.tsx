"use client";

import { useMemo, useState } from "react";
import { Button } from "@/src/components/ui/button";
import type { VoucherPackage } from "@/src/services/adminVoucherService";
import type { AdminRewardCampaignSummary, AdminRewardMode, AdminWelcomeRewardSettings } from "@/src/services/adminRewardService";
import { cn } from "@/src/utils/cn";
import { isAdminRewardPackageAvailable } from "@/src/utils/adminRewardPool";

const MODES: Array<{ value: AdminRewardMode; title: string; description: string }> = [
  { value: "POINTS", title: "5 🐟", description: "Tặng 5 điểm ngay sau đăng ký." },
  { value: "FIXED_VOUCHER", title: "Voucher cố định", description: "Mọi khách mới nhận cùng một voucher." },
  { value: "GACHA", title: "Hộp matcha", description: "Khách chọn hộp trong campaign đang chạy." },
];

interface RewardSettingsPanelProps {
  settings: AdminWelcomeRewardSettings;
  packages: VoucherPackage[];
  campaigns: AdminRewardCampaignSummary[];
  saving: boolean;
  onSave: (settings: AdminWelcomeRewardSettings) => Promise<void>;
}

/** Edit the singleton welcome-reward mode and its exclusive reference. */
export function RewardSettingsPanel({ settings, packages, campaigns, saving, onSave }: RewardSettingsPanelProps) {
  const [mode, setMode] = useState(settings.mode);
  const [packageId, setPackageId] = useState(settings.fixed_package_id ?? "");
  const [campaignId, setCampaignId] = useState(settings.active_campaign_id ?? "");
  const selectablePackages = useMemo(() => packages.filter((pkg) => isAdminRewardPackageAvailable(pkg) || pkg.id === settings.fixed_package_id), [packages, settings.fixed_package_id]);
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "ACTIVE");
  const selectedPackageAvailable = selectablePackages.some((pkg) => pkg.id === packageId && isAdminRewardPackageAvailable(pkg));
  const selectedCampaignAvailable = activeCampaigns.some((campaign) => campaign.id === campaignId);
  const valid = mode === "POINTS" || (mode === "FIXED_VOUCHER" ? selectedPackageAvailable : selectedCampaignAvailable);
  const changed = mode !== settings.mode || (mode === "FIXED_VOUCHER" ? packageId !== settings.fixed_package_id : mode === "GACHA" ? campaignId !== settings.active_campaign_id : settings.fixed_package_id !== null || settings.active_campaign_id !== null);

  const save = () => onSave({
    mode,
    fixed_package_id: mode === "FIXED_VOUCHER" ? packageId : null,
    active_campaign_id: mode === "GACHA" ? campaignId : null,
    revision: settings.revision,
  });

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5" aria-labelledby="reward-settings-title">
      <div><h2 id="reward-settings-title" className="text-lg font-bold">Quà chào mừng mặc định</h2><p className="text-sm text-muted-foreground">Áp dụng cho tài khoản đăng ký sau khi lưu.</p></div>
      <div className="grid gap-3 md:grid-cols-3">
        {MODES.map((item) => (
          <label key={item.value} className={cn("flex min-h-24 cursor-pointer gap-3 rounded-xl border p-4 focus-within:ring-2 focus-within:ring-ring", mode === item.value && "border-primary bg-primary/5")}>
            <input type="radio" name="welcome-mode" value={item.value} checked={mode === item.value} onChange={() => setMode(item.value)} className="mt-1 size-4" />
            <span><span className="block font-bold">{item.title}</span><span className="mt-1 block text-sm text-muted-foreground">{item.description}</span></span>
          </label>
        ))}
      </div>
      {mode === "FIXED_VOUCHER" ? (
        <label className="block text-sm font-medium">Voucher dành cho khách mới
          <select value={packageId} onChange={(event) => setPackageId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="">Chọn voucher</option>{selectablePackages.map((pkg) => { const available = isAdminRewardPackageAvailable(pkg); return <option key={pkg.id} value={pkg.id} disabled={!available}>{pkg.name}{available ? "" : " (không còn khả dụng — đang cấu hình)"}</option>; })}
          </select>
        </label>
      ) : null}
      {mode === "GACHA" ? (
        <label className="block text-sm font-medium">Campaign đang hoạt động
          <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="">Chọn campaign ACTIVE</option>{[...activeCampaigns, ...campaigns.filter((campaign) => campaign.id === settings.active_campaign_id && campaign.status !== "ACTIVE")].map((campaign) => <option key={campaign.id} value={campaign.id} disabled={campaign.status !== "ACTIVE"}>{campaign.name}{campaign.status === "ACTIVE" ? "" : ` (${campaign.status} — đang cấu hình)`}</option>)}
          </select>
        </label>
      ) : null}
      <div className="flex justify-end"><Button disabled={!valid || !changed || saving} onClick={() => void save()}>{saving ? "Đang lưu…" : "Lưu cấu hình"}</Button></div>
    </section>
  );
}
