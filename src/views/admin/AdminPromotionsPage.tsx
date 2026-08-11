"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchMenu } from "@/src/services/menuService";
import { fetchPowders } from "@/src/services/powderService";
import {
  createPromotion,
  listPromotions,
  setPromotionActive,
} from "@/src/services/adminPromotionService";
import {
  buildBundlePromotionInput,
  type BundlePromotionFormState,
} from "@/src/lib/utils/adminPromotion";

function localDateTime(offsetDays: number): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function initialForm(): BundlePromotionFormState {
  return {
    title: "",
    startsAt: localDateTime(0),
    endsAt: localDateTime(7),
    acquisitionMode: "AUTO_GRANT",
    pointsCost: 0,
    buyQuantity: 1,
    rewardQuantity: 1,
    rewardKind: "PRODUCT",
    rewardMode: "SAME_CONFIG",
    benefitScaling: "PER_BUNDLE",
    maxApplications: 1,
    qualifierMenuItemId: "",
    rewardMenuItemId: "",
    rewardSize: "SMALL",
    rewardPowderId: "",
    rewardMilkTypeId: "",
    rewardAddonOptionId: "",
    referencePriceVnd: 0,
  };
}

const inputClass = "min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm";

/** Admin surface for publishing immutable BUNDLE campaigns and toggling activity. */
export default function AdminPromotionsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BundlePromotionFormState>(initialForm);
  const update = <K extends keyof BundlePromotionFormState>(
    key: K,
    value: BundlePromotionFormState[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const { data: promotions = [] } = useQuery({
    queryKey: ["admin", "promotions"],
    queryFn: listPromotions,
  });
  const { data: menuData } = useQuery({ queryKey: ["menu"], queryFn: fetchMenu });
  const { data: powderData } = useQuery({
    queryKey: ["admin", "powders", "raw"],
    queryFn: fetchPowders,
  });
  const menuItems = menuData ? [...menuData.latte, ...menuData.fusion] : [];
  const addonOptions = (menuData?.addon_groups ?? [])
    .flatMap((group) => group.options)
    .filter((option) => option.gram_value === null);
  const selectedRewardItem = menuItems.find((item) => item.id === form.rewardMenuItemId);

  const createMutation = useMutation({
    mutationFn: () => createPromotion(buildBundlePromotionInput(form)),
    onSuccess: () => {
      toast.success("Đã phát hành chương trình");
      setForm(initialForm());
      queryClient.invalidateQueries({ queryKey: ["admin", "promotions"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setPromotionActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "promotions"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const canSubmit =
    form.title.trim().length > 0 &&
    form.qualifierMenuItemId.length > 0 &&
    (form.rewardKind === "ADDON"
      ? form.rewardAddonOptionId.length > 0
      : form.rewardMode === "SAME_CONFIG" ||
        (form.rewardMenuItemId.length > 0 &&
          (form.rewardMode === "ALLOWED_SCOPE"
            ? form.referencePriceVnd > 0
            : form.rewardPowderId.length > 0 &&
              (selectedRewardItem?.category !== "latte" || form.rewardMilkTypeId.length > 0))));

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 pb-28">
      <div>
        <h1 className="font-serif text-2xl font-bold text-primary">Khuyến mãi mua X tặng Y</h1>
        <p className="text-sm text-muted-foreground">Rule được khóa sau khi phát hành; chỉ có thể bật hoặc tắt.</p>
      </div>

      <form
        className="grid gap-4 rounded-2xl border bg-card p-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) createMutation.mutate();
        }}
      >
        <label className="space-y-1 md:col-span-2">
          <span className="text-sm font-semibold">Tên chương trình</span>
          <input className={inputClass} value={form.title} onChange={(event) => update("title", event.target.value)} />
        </label>
        <label className="space-y-1"><span className="text-sm font-semibold">Bắt đầu</span><input type="datetime-local" className={inputClass} value={form.startsAt} onChange={(event) => update("startsAt", event.target.value)} /></label>
        <label className="space-y-1"><span className="text-sm font-semibold">Kết thúc</span><input type="datetime-local" className={inputClass} value={form.endsAt} onChange={(event) => update("endsAt", event.target.value)} /></label>
        <label className="space-y-1"><span className="text-sm font-semibold">Cách nhận voucher</span><select className={inputClass} value={form.acquisitionMode} onChange={(event) => update("acquisitionMode", event.target.value as BundlePromotionFormState["acquisitionMode"])}><option value="AUTO_GRANT">Tự cấp cho mọi khách</option><option value="FREE_CLAIM">Nhận miễn phí</option><option value="POINTS_EXCHANGE">Đổi bằng điểm</option></select></label>
        <label className="space-y-1"><span className="text-sm font-semibold">Điểm đổi</span><input type="number" min="0" disabled={form.acquisitionMode !== "POINTS_EXCHANGE"} className={inputClass} value={form.pointsCost} onChange={(event) => update("pointsCost", Number(event.target.value))} /></label>
        <label className="space-y-1"><span className="text-sm font-semibold">Mua X</span><input type="number" min="1" className={inputClass} value={form.buyQuantity} onChange={(event) => update("buyQuantity", Number(event.target.value))} /></label>
        <label className="space-y-1"><span className="text-sm font-semibold">Tặng Y</span><input type="number" min="1" className={inputClass} value={form.rewardQuantity} onChange={(event) => update("rewardQuantity", Number(event.target.value))} /></label>
        <label className="space-y-1"><span className="text-sm font-semibold">Món mua hợp lệ</span><select required className={inputClass} value={form.qualifierMenuItemId} onChange={(event) => update("qualifierMenuItemId", event.target.value)}><option value="">Chọn món</option>{menuItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="space-y-1"><span className="text-sm font-semibold">Loại quà</span><select className={inputClass} value={form.rewardKind} onChange={(event) => update("rewardKind", event.target.value as BundlePromotionFormState["rewardKind"])}><option value="PRODUCT">Sản phẩm</option><option value="ADDON">Addon</option></select></label>

        {form.rewardKind === "PRODUCT" ? (
          <>
            <label className="space-y-1"><span className="text-sm font-semibold">Cấu hình quà</span><select className={inputClass} value={form.rewardMode} onChange={(event) => update("rewardMode", event.target.value as BundlePromotionFormState["rewardMode"])}><option value="SAME_CONFIG">Giống món mua</option><option value="FIXED_CONFIG">Cấu hình cố định</option><option value="ALLOWED_SCOPE">Trong phạm vi, có hạn mức</option></select></label>
            {form.rewardMode !== "SAME_CONFIG" ? <label className="space-y-1"><span className="text-sm font-semibold">Món được tặng</span><select className={inputClass} value={form.rewardMenuItemId} onChange={(event) => update("rewardMenuItemId", event.target.value)}><option value="">Chọn món</option>{menuItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
            {form.rewardMode === "FIXED_CONFIG" ? <><label className="space-y-1"><span className="text-sm font-semibold">Size quà</span><select className={inputClass} value={form.rewardSize} onChange={(event) => update("rewardSize", event.target.value as BundlePromotionFormState["rewardSize"])}><option value="SMALL">Small</option><option value="MEDIUM">Medium</option><option value="LARGE">Large</option></select></label><label className="space-y-1"><span className="text-sm font-semibold">Bột quà</span><select className={inputClass} value={form.rewardPowderId} onChange={(event) => update("rewardPowderId", event.target.value)}><option value="">Chọn bột</option>{(powderData?.data ?? []).map((powder) => <option key={powder.id} value={powder.id}>{powder.name}</option>)}</select></label><label className="space-y-1"><span className="text-sm font-semibold">Sữa quà (Latte)</span><select className={inputClass} value={form.rewardMilkTypeId} onChange={(event) => update("rewardMilkTypeId", event.target.value)}><option value="">Không áp dụng</option>{(menuData?.milk_types ?? []).map((milk) => <option key={milk.id} value={milk.id}>{milk.name}</option>)}</select></label></> : null}
            {form.rewardMode === "ALLOWED_SCOPE" ? <label className="space-y-1"><span className="text-sm font-semibold">Mức giá được tặng (VND)</span><input type="number" min="1000" step="1000" className={inputClass} value={form.referencePriceVnd} onChange={(event) => update("referencePriceVnd", Number(event.target.value))} /></label> : null}
          </>
        ) : <label className="space-y-1"><span className="text-sm font-semibold">Addon được tặng</span><select className={inputClass} value={form.rewardAddonOptionId} onChange={(event) => update("rewardAddonOptionId", event.target.value)}><option value="">Chọn addon</option>{addonOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>}

        <label className="space-y-1"><span className="text-sm font-semibold">Cách nhân quà</span><select className={inputClass} value={form.benefitScaling} onChange={(event) => update("benefitScaling", event.target.value as BundlePromotionFormState["benefitScaling"])}><option value="PER_BUNDLE">Theo mỗi nhóm mua X</option><option value="ONCE_PER_ORDER">Một lần mỗi đơn</option><option value="PER_QUALIFYING_ITEM">Theo từng món hợp lệ</option></select></label>
        <label className="space-y-1"><span className="text-sm font-semibold">Số nhóm tối đa/đơn</span><input type="number" min="1" className={inputClass} value={form.maxApplications} onChange={(event) => update("maxApplications", Number(event.target.value))} /></label>
        <button type="submit" disabled={!canSubmit || createMutation.isPending} className="min-h-11 rounded-xl bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50 md:col-span-2">{createMutation.isPending ? "Đang phát hành…" : "Phát hành chương trình"}</button>
      </form>

      <section className="space-y-3">
        {promotions.map((promotion) => <article key={promotion.id} className="flex items-center justify-between rounded-2xl border bg-card p-4"><div><p className="font-bold">{promotion.title}</p><p className="text-xs text-muted-foreground">{new Date(promotion.starts_at).toLocaleString("vi-VN")} – {new Date(promotion.ends_at).toLocaleString("vi-VN")}</p></div><button type="button" onClick={() => toggleMutation.mutate({ id: promotion.id, active: !promotion.is_active })} className="min-h-11 rounded-xl border px-3 text-sm font-semibold">{promotion.is_active ? "Tắt" : "Bật"}</button></article>)}
      </section>
    </main>
  );
}
