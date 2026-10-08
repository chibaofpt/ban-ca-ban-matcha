"use client";

import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/src/components/ui/button";
import type { VoucherPackage } from "@/src/services/adminVoucherService";
import type { AdminRewardCampaignSummary, AdminRewardMode, AdminWelcomeRewardSettings } from "@/src/services/adminRewardService";
import { cn } from "@/src/utils/cn";
import { isAdminRewardPackageAvailable } from "@/src/utils/adminRewardPool";

const pointsSchema = z.object({ points_amount: z.number("Nhập số điểm hợp lệ").int("Điểm phải là số nguyên").min(1, "Tối thiểu 1 điểm").max(100, "Tối đa 100 điểm") });

const MODES: Array<{ value: AdminRewardMode; title: string; description: string }> = [
  { value: "POINTS", title: "Điểm cá 🐟", description: "Tặng điểm ngay sau đăng ký theo mức cấu hình." },
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
  const { register, handleSubmit, control, formState: { errors } } = useForm<{ points_amount: number }>({ resolver: zodResolver(pointsSchema), mode: "onBlur", defaultValues: { points_amount: settings.points_amount } });
  const points = useWatch({ control, name: "points_amount" });
  const [packageId, setPackageId] = useState(settings.fixed_package_id ?? "");
  const [campaignId, setCampaignId] = useState(settings.active_campaign_id ?? "");
  const selectablePackages = useMemo(() => packages.filter((pkg) => isAdminRewardPackageAvailable(pkg) || pkg.id === settings.fixed_package_id), [packages, settings.fixed_package_id]);
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "ACTIVE");
  const selectedPackageAvailable = selectablePackages.some((pkg) => pkg.id === packageId && isAdminRewardPackageAvailable(pkg));
  const selectedCampaignAvailable = activeCampaigns.some((campaign) => campaign.id === campaignId);
  const valid = Number.isInteger(points) && points >= 1 && points <= 100 && (mode === "POINTS" || (mode === "FIXED_VOUCHER" ? selectedPackageAvailable : selectedCampaignAvailable));
  const changed = points !== settings.points_amount || mode !== settings.mode || (mode === "FIXED_VOUCHER" ? packageId !== settings.fixed_package_id : mode === "GACHA" ? campaignId !== settings.active_campaign_id : settings.fixed_package_id !== null || settings.active_campaign_id !== null);

  const save = ({ points_amount }: { points_amount: number }) => onSave({
    points_amount,
    mode,
    fixed_package_id: mode === "FIXED_VOUCHER" ? packageId : null,
    active_campaign_id: mode === "GACHA" ? campaignId : null,
    revision: settings.revision,
  });

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5" aria-labelledby="reward-settings-title">
      <div><h2 id="reward-settings-title" className="text-lg font-bold">Quà chào mừng mặc định</h2><p className="text-sm text-muted-foreground">Áp dụng cho tài khoản đăng ký sau khi lưu.</p></div>
      <label className="block text-sm font-medium" htmlFor="welcome-points">Số điểm chào mừng
        <input id="welcome-points" type="number" inputMode="numeric" min={1} max={100} step={1} disabled={saving}
          {...register("points_amount", { valueAsNumber: true })} aria-invalid={Boolean(errors.points_amount)} aria-describedby="welcome-points-help welcome-points-error"
          className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <span id="welcome-points-help" className="mt-1 block text-xs font-normal text-muted-foreground">Dùng chung cho quà điểm và quà thay thế khi voucher hoặc campaign không còn khả dụng. Khách đã đăng ký giữ mức điểm lúc đăng ký.</span>
        {errors.points_amount ? <span id="welcome-points-error" role="alert" className="mt-1 block text-xs text-destructive">{errors.points_amount.message}</span> : null}
      </label>
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
      <div className="flex justify-end"><Button disabled={!valid || !changed || saving} onClick={() => void handleSubmit(save)()}>{saving ? "Đang lưu…" : "Lưu cấu hình"}</Button></div>
    </section>
  );
}
