"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import MenuImageCropField from "@/src/components/admin/MenuImageCropField";
import { Button } from "@/src/components/ui/button";
import type { AdminRewardBox, AdminRewardBoxCreateInput, AdminRewardBoxUpdateInput, AdminRewardCampaignStatus } from "@/src/services/adminRewardService";

const boxSchema = (creating: boolean) => z.object({
  name: z.string().trim().min(1, "Nhập tên hộp.").max(80, "Tên hộp tối đa 80 ký tự."),
  mouth_anchor_x: z.number().min(0, "Vị trí ngang từ 0% đến 100%.").max(100, "Vị trí ngang từ 0% đến 100%."),
  mouth_anchor_y: z.number().min(0, "Vị trí dọc từ 0% đến 100%.").max(100, "Vị trí dọc từ 0% đến 100%."),
  closed_image: z.custom<File | null>((value) => !creating || value instanceof File, "Hộp mới cần ảnh đóng."),
  open_image: z.custom<File | null>((value) => !creating || value instanceof File, "Hộp mới cần ảnh mở."),
});

type BoxFormValues = z.infer<ReturnType<typeof boxSchema>>;

interface RewardBoxFormProps {
  current: AdminRewardBox | null;
  campaignStatus: AdminRewardCampaignStatus;
  revision: number;
  saving: boolean;
  onCancel: () => void;
  onCreate: (input: AdminRewardBoxCreateInput) => Promise<boolean>;
  onUpdate: (boxId: string, input: AdminRewardBoxUpdateInput) => Promise<boolean>;
}

function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

/** Render the on-blur validated create/edit form for one reward box. */
export function RewardBoxForm({ current, campaignStatus, revision, saving, onCancel, onCreate, onUpdate }: RewardBoxFormProps) {
  const { register, handleSubmit, setError, clearErrors, setValue, control, formState: { errors, dirtyFields } } = useForm<BoxFormValues>({
    resolver: zodResolver(boxSchema(!current)),
    mode: "onBlur",
    defaultValues: {
      name: current?.name ?? "",
      mouth_anchor_x: (current?.mouth_anchor_x ?? 0.5) * 100,
      mouth_anchor_y: (current?.mouth_anchor_y ?? 0.2) * 100,
      closed_image: null,
      open_image: null,
    },
  });
  const anchorX = useWatch({ control, name: "mouth_anchor_x" });
  const anchorY = useWatch({ control, name: "mouth_anchor_y" });
  const closedFile = useWatch({ control, name: "closed_image" });
  const openFile = useWatch({ control, name: "open_image" });
  const closedPreview = useObjectUrl(closedFile) ?? current?.closed_image_url;
  const openPreview = useObjectUrl(openFile) ?? current?.open_image_url;
  const nameEditable = !current || campaignStatus === "DRAFT";

  const submit = async (values: BoxFormValues) => {
    const fieldChanged = (nameEditable && dirtyFields.name) || dirtyFields.mouth_anchor_x || dirtyFields.mouth_anchor_y;
    if (current && !fieldChanged && !closedFile && !openFile) {
      setError("root", { message: "Hãy thay đổi ít nhất một trường hoặc ảnh." });
      return;
    }
    if (!current) {
      const saved = await onCreate({ revision, name: values.name.trim(), mouth_anchor_x: values.mouth_anchor_x / 100, mouth_anchor_y: values.mouth_anchor_y / 100, closed_image: closedFile!, open_image: openFile! });
      if (saved) onCancel();
      return;
    }
    const saved = await onUpdate(current.id, {
      revision,
      ...(nameEditable && dirtyFields.name ? { name: values.name.trim() } : {}),
      ...(dirtyFields.mouth_anchor_x ? { mouth_anchor_x: values.mouth_anchor_x / 100 } : {}),
      ...(dirtyFields.mouth_anchor_y ? { mouth_anchor_y: values.mouth_anchor_y / 100 } : {}),
      ...(closedFile ? { closed_image: closedFile } : {}),
      ...(openFile ? { open_image: openFile } : {}),
    });
    if (saved) onCancel();
  };

  return (
    <form id="reward-box-form" onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
      {errors.root?.message ? <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{errors.root.message}</p> : null}
      <Field id="reward-box-name" label="Tên hộp" hint={!nameEditable ? "Chỉ đổi tên khi campaign còn ở bản nháp." : undefined} error={errors.name?.message}><input id="reward-box-name" {...register("name")} maxLength={80} disabled={!nameEditable} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "reward-box-name-error" : !nameEditable ? "reward-box-name-hint" : undefined} className="h-11 w-full rounded-xl border bg-background px-3 disabled:cursor-not-allowed disabled:opacity-60" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="reward-box-anchor-x" label="Vị trí ngang (%)" hint="0% trái · 100% phải" error={errors.mouth_anchor_x?.message}><input id="reward-box-anchor-x" type="number" min={0} max={100} step={1} {...register("mouth_anchor_x", { valueAsNumber: true })} aria-invalid={Boolean(errors.mouth_anchor_x)} aria-describedby={errors.mouth_anchor_x ? "reward-box-anchor-x-error" : "reward-box-anchor-x-hint"} className="h-11 w-full rounded-xl border bg-background px-3" /></Field>
        <Field id="reward-box-anchor-y" label="Vị trí dọc (%)" hint="0% trên · 100% dưới" error={errors.mouth_anchor_y?.message}><input id="reward-box-anchor-y" type="number" min={0} max={100} step={1} {...register("mouth_anchor_y", { valueAsNumber: true })} aria-invalid={Boolean(errors.mouth_anchor_y)} aria-describedby={errors.mouth_anchor_y ? "reward-box-anchor-y-error" : "reward-box-anchor-y-hint"} className="h-11 w-full rounded-xl border bg-background px-3" /></Field>
      </div>
      <p className="text-xs text-muted-foreground">Ảnh nguồn ngang hoặc dọc đều được phép; hãy kéo và thu/phóng để đặt ảnh vào khung vuông.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <CropField label="Ảnh hộp đóng" required={!current} currentImageUrl={current?.closed_image_url} error={errors.closed_image?.message} onFileChange={(file) => setValue("closed_image", file, { shouldDirty: true, shouldValidate: true })} onError={(message) => message ? setError("closed_image", { message }) : clearErrors("closed_image")} />
        <CropField label="Ảnh hộp mở" required={!current} currentImageUrl={current?.open_image_url} error={errors.open_image?.message} onFileChange={(file) => setValue("open_image", file, { shouldDirty: true, shouldValidate: true })} onError={(message) => message ? setError("open_image", { message }) : clearErrors("open_image")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <BoxImagePreview label="Ảnh hộp đóng" src={closedPreview} anchorX={anchorX} anchorY={anchorY} />
        <BoxImagePreview label="Ảnh hộp mở" src={openPreview} anchorX={anchorX} anchorY={anchorY} />
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Hủy</Button><Button type="submit" disabled={saving}>{saving ? "Đang lưu…" : "Lưu hộp"}</Button></div>
    </form>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return <label htmlFor={id} className="block text-sm font-medium">{label}<span className="mt-1 block">{children}</span>{hint && !error ? <span id={`${id}-hint`} className="mt-1 block text-xs font-normal text-muted-foreground">{hint}</span> : null}{error ? <span id={`${id}-error`} role="alert" className="mt-1 block text-xs text-destructive">{error}</span> : null}</label>;
}

function CropField({ label, required, currentImageUrl, error, onFileChange, onError }: { label: string; required: boolean; currentImageUrl?: string | null; error?: string; onFileChange: (file: File | null) => void; onError: (message: string | null) => void }) {
  return <div><MenuImageCropField hasExistingImage={Boolean(currentImageUrl)} currentImageUrl={currentImageUrl} label={`${label}${required ? " *" : ""}`} onFileChange={onFileChange} onError={onError} outputSize={800} outputQuality={0.75} />{error ? <p role="alert" className="mt-1 text-xs text-destructive">{error}</p> : null}</div>;
}

function BoxImagePreview({ label, src, anchorX, anchorY }: { label: string; src?: string | null; anchorX: number; anchorY: number }) {
  if (!src) return null;
  return <div><p className="mb-1 text-sm font-medium">Vị trí kết quả trên {label.toLowerCase()}</p><div className="relative aspect-square overflow-hidden rounded-xl bg-muted"><Image src={src} alt={`Xem trước ${label.toLowerCase()}`} fill sizes="240px" unoptimized={src.startsWith("blob:")} className="object-contain" /><span aria-hidden="true" className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-destructive shadow" style={{ left: `${anchorX}%`, top: `${anchorY}%` }} /></div></div>;
}
