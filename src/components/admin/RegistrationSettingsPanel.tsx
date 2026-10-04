"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import type { RegistrationOtpAdminData, RegistrationOtpSettings } from "@/contracts/registrationOtp";
import { Button } from "@/src/components/ui/button";
import { ApiServiceError } from "@/src/lib/api/serviceError";
import { getRegistrationBalance, getRegistrationSettings, registrationOtpKeys, updateRegistrationSettings } from "@/src/services/registrationOtpService";

const schema = z.object({ otp_enabled: z.boolean(), daily_send_limit: z.number().int().min(1, "Nhập số lượt gửi lớn hơn 0.").max(2147483647) });
function errorText(error: unknown): string {
  return error instanceof ApiServiceError && error.status === 409 ? "Cài đặt đã thay đổi. Hãy tải lại rồi lưu."
    : error instanceof ApiServiceError && error.status === 400 ? "Giới hạn gửi phải là số nguyên lớn hơn 0."
      : "Không tải hoặc lưu được cài đặt. Vui lòng thử lại.";
}

/** Show global OTP policy, paid-send usage and a balance that remains visible when refresh fails. */
export function RegistrationSettingsPanel() {
  const client = useQueryClient();
  const config = useQuery({ queryKey: registrationOtpKeys.settings, queryFn: getRegistrationSettings, retry: false });
  const balance = useQuery({ queryKey: registrationOtpKeys.balance, queryFn: getRegistrationBalance, staleTime: 60000, retry: false,
    refetchInterval: false, refetchOnReconnect: false, refetchOnMount: "always", refetchOnWindowFocus: false });
  const save = useMutation({
    mutationFn: updateRegistrationSettings,
    onSuccess: (settings) => {
      client.setQueryData<RegistrationOtpAdminData>(registrationOtpKeys.settings, (previous) => previous ? { ...previous, ...settings } : previous);
      void client.invalidateQueries({ queryKey: registrationOtpKeys.settings });
    },
  });
  return <section aria-labelledby="registration-settings-title" className="space-y-4 rounded-2xl border bg-card p-4 md:p-5">
    <h2 id="registration-settings-title" className="text-lg font-semibold">Xác nhận số điện thoại khi đăng ký</h2>
    <p className="text-sm text-muted-foreground">Áp dụng cho đăng ký mới. Tài khoản đã có giữ nguyên trạng thái xác minh.</p>
    {config.isPending ? <p role="status" className="flex gap-2"><Loader2 className="size-4 animate-spin" />Đang tải cài đặt…</p> : config.data ?
      <SettingsEditor key={config.data.revision} settings={config.data} saving={save.isPending} onSave={async (values) => {
        await save.mutateAsync({ ...values, revision: config.data.revision });
      }} /> : null}
    {config.error ? <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{errorText(config.error)}</p><Button variant="outline" onClick={() => void config.refetch()}>Tải lại cài đặt</Button></div> : null}
    {save.error ? <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{errorText(save.error)}</p><Button variant="ghost" onClick={() => void config.refetch()}>Tải cài đặt mới</Button></div> : null}
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <div className="rounded-xl bg-muted p-3"><p className="font-medium">Lượt đã giữ chỗ hôm nay</p>
        <p>{config.data?.today_reserved_count == null ? "Chưa tải được số lượt." : `${config.data.today_reserved_count} lượt`}</p>
        <p className="mt-1 text-muted-foreground">{config.data?.estimated_cost_vnd == null ? "Chưa có chi phí ước tính." : `Ước tính ${config.data.estimated_cost_vnd.toLocaleString("vi-VN")} đ · 350 đ/lượt`}</p>
      </div>
      <div className="space-y-2 rounded-xl bg-muted p-3"><p className="font-medium">Số dư ABENLA</p>
        {balance.data ? <><p>{balance.data.balance.toLocaleString("vi-VN")}</p><p className="text-xs text-muted-foreground">Kiểm tra lúc {new Date(balance.data.checked_at).toLocaleString("vi-VN")}{balance.error ? " · Số dư trước lần tải lỗi" : ""}</p></> : <p>{balance.isPending ? "Đang kiểm tra…" : "Chưa tải được số dư."}</p>}
        {balance.error ? <p role="alert" className="text-xs text-destructive">Chưa thể làm mới số dư. Số dư và thời gian gần nhất được giữ lại.</p> : null}
        <Button variant="outline" size="sm" disabled={balance.isFetching} onClick={() => void balance.refetch()}>{balance.isFetching ? "Đang kiểm tra…" : "Làm mới số dư"}</Button>
      </div>
    </div>
  </section>;
}

function SettingsEditor({ settings, saving, onSave }: {
  settings: RegistrationOtpSettings; saving: boolean; onSave: (value: z.infer<typeof schema>) => Promise<void>;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema), mode: "onBlur", defaultValues: { otp_enabled: settings.otp_enabled, daily_send_limit: settings.daily_send_limit },
  });
  return <form onSubmit={handleSubmit(async (values) => { await onSave(values).catch(() => undefined); })} className="space-y-3">
    <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" {...register("otp_enabled")} className="size-5 accent-primary focus-visible:ring-2 focus-visible:ring-ring" />Yêu cầu mã OTP khi đăng ký</label>
    <label htmlFor="registration-daily-limit" className="block text-sm font-medium">Giới hạn lượt gửi mỗi ngày (UTC+7)
      <input id="registration-daily-limit" type="number" min={1} step={1} {...register("daily_send_limit", { valueAsNumber: true })}
        aria-invalid={Boolean(errors.daily_send_limit)} aria-describedby={errors.daily_send_limit ? "registration-daily-limit-error" : undefined}
        className="mt-2 h-11 w-full rounded-xl border bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      {errors.daily_send_limit ? <span id="registration-daily-limit-error" role="alert" className="mt-1 block text-xs text-destructive">{errors.daily_send_limit.message}</span> : null}
    </label>
    <Button type="submit" disabled={saving}>{saving ? "Đang lưu…" : "Lưu cài đặt"}</Button>
  </form>;
}
