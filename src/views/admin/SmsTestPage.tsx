"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ArrowLeft, CheckCircle2, Loader2, RefreshCw, Send } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { ApiServiceError } from "@/src/lib/api/serviceError";
import {
  checkSmsConnection, getSmsBalance, sendTestOtp, verifyTestOtp,
} from "@/src/services/smsTestService";
import type { SmsTestBalanceData, SmsTestSendOtpData } from "@/contracts/smsTest";

const phoneSchema = z.object({
  phone_number: z.string().trim().regex(
    /^(?:0|84|\+84)[35789]\d{8}$/,
    "Nhập số di động Việt Nam hợp lệ, ví dụ 0912345678.",
  ),
});
const otpSchema = z.object({ otp: z.string().regex(/^\d{6}$/, "Nhập đúng 6 chữ số trong SMS.") });
type PhoneForm = z.infer<typeof phoneSchema>;
type OtpForm = z.infer<typeof otpSchema>;

function errorDetails(error: ApiServiceError): { reason: string | null; providerCode: number | null } {
  const details = error.details;
  if (!details || typeof details !== "object") return { reason: null, providerCode: null };
  return {
    reason: "reason" in details && typeof details.reason === "string" ? details.reason : null,
    providerCode: "provider_code" in details && typeof details.provider_code === "number" ? details.provider_code : null,
  };
}

function friendlyError(error: unknown): string {
  if (error instanceof ApiServiceError) {
    const { reason, providerCode } = errorDetails(error);
    const messages: Record<string, string> = {
      INVALID_REQUEST: "Thông tin gửi chưa hợp lệ.",
      INVALID_PHONE_NUMBER: "Số điện thoại chưa hợp lệ.",
      REQUEST_ID_CONFLICT: "Yêu cầu gửi bị trùng với một số khác. Vui lòng thử lại.",
      SMS_TEST_COOLDOWN: "Vui lòng chờ trước khi gửi lại OTP đến số này.",
      SMS_TEST_LIMIT: "Đã đạt giới hạn thử nghiệm SMS. Vui lòng thử lại sau.",
      OTP_INVALID: "Mã OTP chưa đúng.",
      OTP_EXPIRED: "Mã OTP đã hết hạn. Vui lòng gửi mã mới.",
      OTP_LOCKED: "Đã nhập sai quá số lần cho phép. Vui lòng gửi mã mới.",
      OTP_CHALLENGE_NOT_FOUND: "Không tìm thấy lần gửi này. Vui lòng gửi mã mới.",
      SMS_TEST_UNAVAILABLE: "Luồng test SMS đang tạm thời không khả dụng.",
      SMS_PROVIDER_UNAVAILABLE: "Không thể kết nối ABENLA lúc này. Vui lòng thử lại sau.",
      SMS_PROVIDER_REJECTED: "ABENLA từ chối yêu cầu gửi. Hãy kiểm tra cấu hình và số dư.",
    };
    if (reason && messages[reason]) return `${messages[reason]}${providerCode === null ? "" : ` (Mã ABENLA: ${providerCode})`}`;
    if (error.status === 429) return "Thao tác quá nhanh. Vui lòng thử lại sau.";
    if (error.status === 401 || error.status === 403) return "Phiên quản trị không còn hợp lệ. Vui lòng đăng nhập lại.";
    return "Không thể hoàn tất thao tác lúc này. Vui lòng thử lại.";
  }
  return "Không thể kết nối lúc này. Vui lòng thử lại.";
}

function remainingSeconds(timestamp: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(timestamp) - now) / 1000));
}

const inputClass = "min-h-11 w-full rounded-xl border border-input bg-background px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Isolated admin workspace for checking Abenla and manually verifying a staged OTP. */
export default function SmsTestPage() {
  const [challenge, setChallenge] = useState<SmsTestSendOtpData | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [verified, setVerified] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [lastBalance, setLastBalance] = useState<SmsTestBalanceData | null>(null);
  const requestId = useRef<string | null>(null);
  const otpInput = useRef<HTMLInputElement | null>(null);

  const phoneForm = useForm<PhoneForm>({ resolver: zodResolver(phoneSchema), mode: "onBlur", defaultValues: { phone_number: "" } });
  const otpForm = useForm<OtpForm>({ resolver: zodResolver(otpSchema), mode: "onBlur", defaultValues: { otp: "" } });
  const otpField = otpForm.register("otp", { onChange: () => setVerifyError(null) });

  const connection = useMutation({ mutationFn: checkSmsConnection, retry: false });
  const balance = useMutation({ mutationFn: getSmsBalance, retry: false, onSuccess: setLastBalance });
  const send = useMutation({ mutationFn: sendTestOtp, retry: false });
  const verify = useMutation({ mutationFn: verifyTestOtp, retry: false });

  useEffect(() => {
    if (!challenge) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [challenge]);

  const submitPhone = phoneForm.handleSubmit(async ({ phone_number }) => {
    setSendError(null);
    requestId.current ??= crypto.randomUUID();
    try {
      const result = await send.mutateAsync({ phone_number, request_id: requestId.current });
      setChallenge(result);
      setNow(Date.now());
      setVerified(false);
      setVerifyError(null);
      otpForm.reset({ otp: "" });
      requestId.current = null;
      balance.mutate();
      window.setTimeout(() => otpInput.current?.focus(), 0);
    } catch (error: unknown) {
      if (error instanceof ApiServiceError && errorDetails(error).reason === "SMS_PROVIDER_REJECTED") {
        requestId.current = null;
      }
      setSendError(friendlyError(error));
    }
  });

  const submitOtp = otpForm.handleSubmit(async ({ otp }) => {
    if (!challenge) return;
    setVerifyError(null);
    try {
      await verify.mutateAsync({ challenge_id: challenge.challenge_id, otp });
      setVerified(true);
      otpForm.reset({ otp: "" });
    } catch (error: unknown) {
      setVerifyError(friendlyError(error));
    }
  });

  const resetChallenge = () => {
    setChallenge(null);
    setVerified(false);
    setSendError(null);
    setVerifyError(null);
    requestId.current = null;
    otpForm.reset({ otp: "" });
  };

  const expired = challenge ? remainingSeconds(challenge.expires_at, now) === 0 : false;
  const resendWait = challenge ? remainingSeconds(challenge.resend_at, now) : 0;

  return (
    <section className="mx-auto w-full max-w-4xl space-y-5 pb-10">
      <div>
        <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft className="size-4" aria-hidden="true" /> Về quản trị
        </Link>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Thử nghiệm SMS · Staging</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold text-foreground">Kiểm tra OTP ABENLA</h1>
        <p className="mt-2 text-sm text-muted-foreground">Gửi OTP sẽ sử dụng số dư ABENLA. Hãy dùng điện thoại bạn đang cầm để kiểm tra mã.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-border bg-card p-4 shadow-sm" aria-labelledby="connection-heading">
          <h2 id="connection-heading" className="text-lg font-semibold">Kết nối ABENLA</h2>
          <p className="mt-2 min-h-12 text-sm" role="status">
            {connection.isPending ? "Đang kiểm tra…" : connection.isError ? friendlyError(connection.error) :
              connection.data ? connection.data.connected ? `Kết nối thành công · mã ${connection.data.provider_code}` : `Kết nối thất bại · mã ${connection.data.provider_code}` : "Chưa kiểm tra"}
          </p>
          {connection.data && <p className="mb-3 text-xs text-muted-foreground">Kiểm tra lúc {new Date(connection.data.checked_at).toLocaleString("vi-VN")}</p>}
          <Button variant="outline" disabled={connection.isPending} onClick={() => connection.mutate()}>
            {connection.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-2 size-4" aria-hidden="true" />}
            Kiểm tra kết nối
          </Button>
        </article>
        <article className="rounded-2xl border border-border bg-card p-4 shadow-sm" aria-labelledby="balance-heading">
          <h2 id="balance-heading" className="text-lg font-semibold">Số dư tài khoản</h2>
          <p className="mt-2 min-h-12 text-2xl font-semibold tabular-nums" role="status">
            {lastBalance ? lastBalance.balance.toLocaleString("vi-VN") : "Chưa tải"}
          </p>
          {lastBalance && <p className="mb-2 text-xs text-muted-foreground">Cập nhật lúc {new Date(lastBalance.checked_at).toLocaleString("vi-VN")}{balance.isError && " · Chưa cập nhật được lần mới"}</p>}
          {balance.isError && <p className="mb-3 text-sm text-destructive" role="alert">{friendlyError(balance.error)}</p>}
          <Button variant="outline" disabled={balance.isPending} onClick={() => balance.mutate()}>
            {balance.isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
            Cập nhật số dư
          </Button>
        </article>
      </div>

      <article className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
        <h2 className="text-lg font-semibold">Gửi OTP thử nghiệm</h2>
        <p className="mt-1 text-sm text-muted-foreground">Chỉ gửi một tin đến số di động Việt Nam bạn nhập.</p>
        <form className="mt-4 space-y-3" onSubmit={submitPhone} noValidate>
          <label htmlFor="sms-test-phone" className="block text-sm font-medium">Số điện thoại nhận OTP</label>
          <input id="sms-test-phone" type="tel" inputMode="tel" autoComplete="tel" className={inputClass} disabled={send.isPending || Boolean(challenge)} aria-invalid={Boolean(phoneForm.formState.errors.phone_number)} aria-describedby={phoneForm.formState.errors.phone_number ? "sms-test-phone-error" : undefined} {...phoneForm.register("phone_number", { onChange: () => { requestId.current = null; setSendError(null); } })} />
          {phoneForm.formState.errors.phone_number && <p id="sms-test-phone-error" className="text-sm text-destructive" role="alert">{phoneForm.formState.errors.phone_number.message}</p>}
          {sendError && <p className="text-sm text-destructive" role="alert">{sendError}</p>}
          {!challenge && <Button type="submit" disabled={send.isPending}>
            {send.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : <Send className="mr-2 size-4" aria-hidden="true" />}
            Gửi OTP
          </Button>}
        </form>

        {challenge && <div className="mt-6 border-t border-border pt-5">
          <h3 className="font-semibold">Nhập mã trên điện thoại</h3>
          <p className="mt-1 text-sm text-muted-foreground">Đã yêu cầu gửi đến {challenge.masked_phone}. Mã có hiệu lực trong 5 phút.</p>
          {challenge.delivery_status === "pending" && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">ABENLA đang xử lý tin nhắn. Bạn vẫn có thể nhập mã khi nhận được.</p>}
          {challenge.delivery_status === "unknown" && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Chưa rõ kết quả gửi. Hãy kiểm tra điện thoại trước khi gửi lại.</p>}
          <p className="mt-2 text-sm tabular-nums" role="status">{expired ? "Mã đã hết hạn" : `Còn ${remainingSeconds(challenge.expires_at, now)} giây`}</p>
          {verified ? <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-green-700 dark:text-green-300" role="status"><CheckCircle2 className="size-5" aria-hidden="true" /> OTP chính xác</div> :
            <form className="mt-4 space-y-3" onSubmit={submitOtp} noValidate>
              <label htmlFor="sms-test-otp" className="block text-sm font-medium">Mã OTP gồm 6 chữ số</label>
              <input id="sms-test-otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={`${inputClass} max-w-xs text-center text-xl tracking-[0.3em]`} disabled={verify.isPending || expired} aria-invalid={Boolean(otpForm.formState.errors.otp)} aria-describedby={otpForm.formState.errors.otp ? "sms-test-otp-error" : undefined} {...otpField} ref={(element) => { otpField.ref(element); otpInput.current = element; }} />
              {otpForm.formState.errors.otp && <p id="sms-test-otp-error" className="text-sm text-destructive" role="alert">{otpForm.formState.errors.otp.message}</p>}
              {verifyError && <p className="text-sm text-destructive" role="alert">{verifyError}</p>}
              <Button type="submit" disabled={verify.isPending || expired}>{verify.isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}Xác minh</Button>
            </form>}
          <div className="mt-4 flex flex-wrap gap-2">
            {!verified && <Button variant="outline" disabled={send.isPending || resendWait > 0} onClick={() => { requestId.current = null; void submitPhone(); }}>{resendWait > 0 ? `Gửi lại sau ${resendWait}s` : "Gửi lại mã"}</Button>}
            <Button variant="ghost" onClick={resetChallenge}>{verified ? "Thử lại" : "Đổi số"}</Button>
          </div>
        </div>}
      </article>
    </section>
  );
}
