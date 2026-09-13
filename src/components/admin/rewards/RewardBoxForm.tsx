"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useEffect, useMemo } from "react";
import { useForm, useWatch, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/src/components/ui/button";
import type { AdminRewardBox, AdminRewardBoxCreateInput, AdminRewardBoxUpdateInput } from "@/src/services/adminRewardService";

const hasSelectedFile = (value: unknown): value is FileList => (
  typeof value === "object" && value !== null && "length" in value
  && typeof value.length === "number" && value.length > 0
);

const boxSchema = (creating: boolean) => z.object({
  name: z.string().trim().min(1, "Nhập tên hộp.").max(80, "Tên hộp tối đa 80 ký tự."),
  mouth_anchor_x: z.number().min(0, "Anchor X từ 0 đến 1.").max(1, "Anchor X từ 0 đến 1."),
  mouth_anchor_y: z.number().min(0, "Anchor Y từ 0 đến 1.").max(1, "Anchor Y từ 0 đến 1."),
  closed_image: z.custom<FileList>((value) => !creating || hasSelectedFile(value), "Hộp mới cần ảnh đóng."),
  open_image: z.custom<FileList>((value) => !creating || hasSelectedFile(value), "Hộp mới cần ảnh mở."),
});

type BoxFormValues = z.infer<ReturnType<typeof boxSchema>>;

interface RewardBoxFormProps {
  current: AdminRewardBox | null;
  revision: number;
  saving: boolean;
  onCancel: () => void;
  onCreate: (input: AdminRewardBoxCreateInput) => Promise<boolean>;
  onUpdate: (boxId: string, input: AdminRewardBoxUpdateInput) => Promise<boolean>;
}

function useObjectUrl(file: File | undefined): string | null {
  const url = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

/** Render the on-blur validated create/edit form for one reward box. */
export function RewardBoxForm({ current, revision, saving, onCancel, onCreate, onUpdate }: RewardBoxFormProps) {
  const { register, handleSubmit, setError, control, formState: { errors, dirtyFields } } = useForm<BoxFormValues>({
    resolver: zodResolver(boxSchema(!current)),
    mode: "onBlur",
    defaultValues: {
      name: current?.name ?? "",
      mouth_anchor_x: current?.mouth_anchor_x ?? 0.5,
      mouth_anchor_y: current?.mouth_anchor_y ?? 0.2,
    },
  });
  const anchorX = useWatch({ control, name: "mouth_anchor_x" });
  const anchorY = useWatch({ control, name: "mouth_anchor_y" });
  const closedFile = useWatch({ control, name: "closed_image" })?.[0];
  const openFile = useWatch({ control, name: "open_image" })?.[0];
  const closedPreview = useObjectUrl(closedFile) ?? current?.closed_image_url;
  const openPreview = useObjectUrl(openFile) ?? current?.open_image_url;

  const submit = async (values: BoxFormValues) => {
    const fieldChanged = dirtyFields.name || dirtyFields.mouth_anchor_x || dirtyFields.mouth_anchor_y;
    if (current && !fieldChanged && !closedFile && !openFile) {
      setError("root", { message: "Hãy thay đổi ít nhất một trường hoặc ảnh." });
      return;
    }
    if (!current) {
      const saved = await onCreate({ revision, name: values.name.trim(), mouth_anchor_x: values.mouth_anchor_x, mouth_anchor_y: values.mouth_anchor_y, closed_image: closedFile!, open_image: openFile! });
      if (saved) onCancel();
      return;
    }
    const saved = await onUpdate(current.id, {
      revision,
      ...(dirtyFields.name ? { name: values.name.trim() } : {}),
      ...(dirtyFields.mouth_anchor_x ? { mouth_anchor_x: values.mouth_anchor_x } : {}),
      ...(dirtyFields.mouth_anchor_y ? { mouth_anchor_y: values.mouth_anchor_y } : {}),
      ...(closedFile ? { closed_image: closedFile } : {}),
      ...(openFile ? { open_image: openFile } : {}),
    });
    if (saved) onCancel();
  };

  return (
    <form id="reward-box-form" onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
      {errors.root?.message ? <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{errors.root.message}</p> : null}
      <Field id="reward-box-name" label="Tên hộp" error={errors.name?.message}><input id="reward-box-name" {...register("name")} maxLength={80} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "reward-box-name-error" : undefined} className="h-11 w-full rounded-xl border bg-background px-3" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="reward-box-anchor-x" label="Anchor X" error={errors.mouth_anchor_x?.message}><input id="reward-box-anchor-x" type="number" min={0} max={1} step={0.01} {...register("mouth_anchor_x", { valueAsNumber: true })} aria-invalid={Boolean(errors.mouth_anchor_x)} aria-describedby={errors.mouth_anchor_x ? "reward-box-anchor-x-error" : undefined} className="h-11 w-full rounded-xl border bg-background px-3" /></Field>
        <Field id="reward-box-anchor-y" label="Anchor Y" error={errors.mouth_anchor_y?.message}><input id="reward-box-anchor-y" type="number" min={0} max={1} step={0.01} {...register("mouth_anchor_y", { valueAsNumber: true })} aria-invalid={Boolean(errors.mouth_anchor_y)} aria-describedby={errors.mouth_anchor_y ? "reward-box-anchor-y-error" : undefined} className="h-11 w-full rounded-xl border bg-background px-3" /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FileField id="reward-box-closed" label="Ảnh hộp đóng" required={!current} preview={closedPreview} anchorX={anchorX} anchorY={anchorY} error={errors.closed_image?.message} inputProps={register("closed_image")} />
        <FileField id="reward-box-open" label="Ảnh hộp mở" required={!current} preview={openPreview} anchorX={anchorX} anchorY={anchorY} error={errors.open_image?.message} inputProps={register("open_image")} />
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Hủy</Button><Button type="submit" disabled={saving}>{saving ? "Đang lưu…" : "Lưu hộp"}</Button></div>
    </form>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return <label htmlFor={id} className="block text-sm font-medium">{label}<span className="mt-1 block">{children}</span>{error ? <span id={`${id}-error`} role="alert" className="mt-1 block text-xs text-destructive">{error}</span> : null}</label>;
}

function FileField({ id, label, required, preview, anchorX, anchorY, error, inputProps }: { id: string; label: string; required: boolean; preview?: string | null; anchorX: number; anchorY: number; error?: string; inputProps: UseFormRegisterReturn }) {
  return <label htmlFor={id} className="text-sm font-medium">{label}{required ? " *" : ""}<input id={id} type="file" accept="image/png,image/jpeg,image/webp" required={required} {...inputProps} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="mt-1 block min-h-11 w-full rounded-xl border bg-background p-2 text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground" />{error ? <span id={`${id}-error`} role="alert" className="mt-1 block text-xs text-destructive">{error}</span> : null}{preview ? <span className="relative mt-2 block aspect-square overflow-hidden rounded-xl bg-muted"><Image src={preview} alt={`Xem trước ${label.toLowerCase()}`} fill sizes="240px" className="object-contain" /><span aria-hidden="true" className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-destructive shadow" style={{ left: `${anchorX * 100}%`, top: `${anchorY * 100}%` }} /></span> : null}</label>;
}
