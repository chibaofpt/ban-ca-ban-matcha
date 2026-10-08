"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import type { RegistrationOtpChallenge } from "@/contracts/registrationOtp";
import { Button } from "@/src/components/ui/button";
import { registrationOtpMessage, registrationOtpRetryAt } from "@/src/hooks/useRegistrationOtp";
import { Header } from "@/src/components/common/register/RegisterStepOne";

const schema = z.object({ otp: z.string().regex(/^\d{6}$/, "Nhập mã gồm 6 chữ số.") });
function waitText(seconds: number): string {
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ngày ${Math.floor(seconds % 86400 / 3600)} giờ`;
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), remaining = seconds % 60;
  return [hours > 0 ? hours : null, String(minutes).padStart(2, "0"), String(remaining).padStart(2, "0")].filter((part) => part !== null).join(":");
}

interface Props {
  challenge: RegistrationOtpChallenge; resendPending: boolean; resendError: unknown;
  resendAllowed: boolean; retryAt?: string; onVerify: (otp: string) => Promise<void>;
  onResend: () => Promise<void>; onBack: () => void;
}

/** Collect one-time code and render countdowns from server instants, including after background pauses. */
export default function RegisterOtpStep({ challenge, resendPending, resendError, resendAllowed, retryAt, onVerify, onResend, onBack }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [verificationError, setVerificationError] = useState<unknown>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema), mode: "onBlur", defaultValues: { otp: "" },
  });
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, []);
  const serverRetry = registrationOtpRetryAt(verificationError);
  const resendTime = Math.max(Date.parse(challenge.resend_at), Date.parse(retryAt ?? challenge.resend_at), Date.parse(serverRetry ?? challenge.resend_at));
  const wait = Math.max(0, Math.ceil((resendTime - now) / 1000));
  const expiry = Math.max(0, Math.ceil((Date.parse(challenge.expires_at) - now) / 1000));
  const submit = async ({ otp }: z.infer<typeof schema>) => {
    setVerificationError(null);
    try { await onVerify(otp); } catch (error) { setVerificationError(error); }
  };
  return <div className="space-y-4">
    <Header step={3} total={3} />
    <p className="text-center text-sm">Vui lòng kiểm tra Zalo của số điện thoại <strong>{challenge.masked_phone}</strong> để lấy mã xác nhận.</p>
    {challenge.delivery_status === "unknown" ? <p role="status" className="text-sm text-muted-foreground">Chưa xác nhận được việc gửi mã. Nếu đã nhận trên Zalo, bạn có thể nhập mã; nếu chưa nhận, hãy chờ để gửi lại.</p> : null}
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <label htmlFor="registration-otp" className="block text-sm font-medium">Mã xác nhận
        <input id="registration-otp" autoComplete="one-time-code" inputMode="numeric" maxLength={6} {...register("otp")}
          aria-invalid={Boolean(errors.otp)} aria-describedby={errors.otp ? "registration-otp-error" : "registration-otp-expiry"}
          className="mt-2 h-12 w-full rounded-xl border bg-background px-4 text-center text-xl tracking-widest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        {errors.otp ? <span id="registration-otp-error" role="alert" className="mt-1 block text-xs text-destructive">{errors.otp.message}</span> : null}
      </label>
      <p id="registration-otp-expiry" className="text-sm text-muted-foreground">{expiry ? `Mã hết hạn sau ${waitText(expiry)}.` : "Mã đã hết hạn."}</p>
      {verificationError ? <p role="alert" className="text-sm text-destructive">{registrationOtpMessage(verificationError)}</p> : null}
      <Button type="submit" className="w-full gap-2" disabled={isSubmitting || resendPending || expiry === 0}>
        {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}Xác nhận và đăng ký
      </Button>
    </form>
    {resendError ? <p role="alert" className="text-sm text-destructive">{registrationOtpMessage(resendError)}</p> : null}
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={isSubmitting || resendPending} onClick={onBack}>Sửa thông tin</Button>
      <Button variant="ghost" disabled={isSubmitting || resendPending || wait > 0 || !resendAllowed} onClick={() => void onResend().catch(() => undefined)}>
        {resendPending ? "Đang gửi…" : wait ? `Gửi lại sau ${waitText(wait)}` : "Gửi lại mã"}
      </Button>
    </div>
  </div>;
}
