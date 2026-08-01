"use client";

import dynamic from "next/dynamic";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { useState, type ReactNode } from "react";
import { Loader2, MapPin } from "lucide-react";
import type { AddressPayload } from "@/src/lib/types/address";
import {
  addressFormSchema,
  type AddressFormInput,
  type AddressFormValues,
} from "@/src/lib/validations/address";

const MapPicker = dynamic(
  () => import("@/src/components/delivery/MapPicker").then((module) => ({ default: module.MapPicker })),
  { ssr: false, loading: () => null },
);

interface AddressFormProps {
  initialData?: AddressPayload;
  onSubmit: (data: AddressPayload) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

const inputClassName =
  "block min-h-11 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

/** Collect and validate a delivery location and receiver details. */
export function AddressForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}: AddressFormProps) {
  const [isMapOpen, setMapOpen] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AddressFormInput, unknown, AddressFormValues>({
    resolver: zodResolver(addressFormSchema),
    mode: "onBlur",
    defaultValues: {
      full_address: initialData?.full_address ?? "",
      label: initialData?.label ?? "",
      lat: initialData?.lat ?? null,
      lng: initialData?.lng ?? null,
      receiver_name: initialData?.receiver_name ?? "",
      receiver_phone: initialData?.receiver_phone ?? "",
      is_default: initialData?.is_default ?? false,
    },
  });
  const fullAddress = useWatch({ control, name: "full_address" });
  const lat = useWatch({ control, name: "lat" });
  const lng = useWatch({ control, name: "lng" });

  const handleMapConfirm = (data: { address: string; lat: number; lng: number }) => {
    setValue("full_address", data.address, { shouldDirty: true, shouldValidate: true });
    setValue("lat", data.lat, { shouldDirty: true, shouldValidate: true });
    setValue("lng", data.lng, { shouldDirty: true, shouldValidate: true });
    setMapOpen(false);
  };

  const submit = async (values: AddressFormValues) => {
    if (values.lat === null || values.lng === null) return;
    const normalizedPhone = values.receiver_phone.startsWith("0")
      ? `+84${values.receiver_phone.slice(1)}`
      : values.receiver_phone;

    try {
      await onSubmit({
        full_address: values.full_address,
        label: values.label.trim(),
        lat: values.lat,
        lng: values.lng,
        receiver_name: values.receiver_name.trim(),
        receiver_phone: normalizedPhone,
        is_default: values.is_default,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Có lỗi xảy ra khi lưu địa chỉ";
      setError("root.server", { message });
    }
  };

  const busy = isLoading || isSubmitting;
  const locationError = errors.full_address?.message ?? errors.lat?.message;

  return (
    <>
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Vị trí giao hàng <span className="text-destructive">*</span>
          </label>
          {fullAddress && lat !== null && lng !== null ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <MapPin className="h-4 w-4 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{fullAddress}</p>
                <button
                  type="button"
                  onClick={() => setMapOpen(true)}
                  className="mt-1 min-h-11 text-xs font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Chọn lại vị trí
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMapOpen(true)}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MapPin className="h-4 w-4" />
              Chọn trên bản đồ
            </button>
          )}
          {locationError && <p className="mt-1 text-xs text-destructive">{locationError}</p>}
        </div>

        <FormInput
          id="address-label"
          label="Tên gợi nhớ"
          required
          error={errors.label?.message}
          input={<input id="address-label" placeholder="Ví dụ: Nhà, Công ty..." {...register("label")} className={inputClassName} />}
        />
        <FormInput
          id="receiver-name"
          label="Tên người nhận"
          required
          error={errors.receiver_name?.message}
          input={<input id="receiver-name" autoComplete="name" placeholder="Ví dụ: Nguyễn Văn A" {...register("receiver_name")} className={inputClassName} />}
        />
        <FormInput
          id="receiver-phone"
          label="Số điện thoại"
          required
          error={errors.receiver_phone?.message}
          input={<input id="receiver-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="Ví dụ: 0912345678" {...register("receiver_phone")} className={inputClassName} />}
        />

        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-foreground">
          <input
            type="checkbox"
            {...register("is_default")}
            className="h-5 w-5 rounded border-border text-primary focus:ring-primary"
          />
          Đặt làm địa chỉ mặc định
        </label>

        {errors.root?.server?.message && (
          <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            {errors.root.server.message}
          </p>
        )}

        <div className="flex gap-3 border-t border-border/60 pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 flex-1 rounded-xl bg-secondary px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lưu địa chỉ"}
          </button>
        </div>
      </form>

      {isMapOpen && (
        <MapPicker
          onConfirm={handleMapConfirm}
          onClose={() => setMapOpen(false)}
          initialLat={lat ?? undefined}
          initialLng={lng ?? undefined}
        />
      )}
    </>
  );
}

function FormInput({
  id,
  label,
  required,
  error,
  input,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  input: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {input}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
