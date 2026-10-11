"use client";
import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/src/components/ui/button";
import { updateAccountPhone, sendAccountPhoneOtp, confirmAccountPhoneOtp } from "@/src/services/accountService";
import type { RegistrationOtpChallenge } from "@/contracts/registrationOtp";
import type { AccountAuthResult } from "@/contracts/account";
import { useRegistrationTurnstile } from "@/src/hooks/useRegistrationTurnstile";
import { useServerDeadline } from "@/src/hooks/useServerDeadline";
import { SHOP_FACEBOOK_URL } from "@/src/utils/contactLinks";
import { toLocalPhone, normalizePhone } from "@/src/utils/phone";
const schema = z.object({ phone_number: z.string().transform(toLocalPhone).pipe(z.string().regex(/^0\d{9}$/, "Nhập số điện thoại hợp lệ")), otp: z.string() });
/** Save an optional phone and enter OTP only after the server reports a ghost collision. */
export function AccountPhoneForm({ phone, onSaved, onMerged }: { phone: string | null; onSaved: () => void; onMerged: (result: AccountAuthResult) => void }) {
  const [collision, setCollision] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<RegistrationOtpChallenge | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const captcha = useRegistrationTurnstile(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "phone_claim");
  const form = useForm({ resolver: zodResolver(schema), mode: "onBlur", defaultValues: { phone_number: phone ? toLocalPhone(phone) : "", otp: "" } });
  const send = useMutation({ mutationFn: sendAccountPhoneOtp, retry: false, onSuccess: setChallenge, onError: (error) => setMessage(error.message), onSettled: captcha.reset });
  const save = useMutation({ mutationFn: updateAccountPhone, retry: false, onSuccess: (result, number) => { if (result.status === "saved") onSaved(); else setCollision(number); }, onError: (error) => setMessage(error.message) });
  const confirm = useMutation({ mutationFn: confirmAccountPhoneOtp, retry: false, onSuccess: onMerged, onError: (error) => setMessage(error.message) });
  const remaining = useServerDeadline(challenge);
  const resendDeadline = useMemo(() => challenge ? { expires_at: challenge.resend_at, server_now: challenge.server_now } : null, [challenge]);
  const resendRemaining = useServerDeadline(resendDeadline);
  const busy = save.isPending || send.isPending || confirm.isPending;
  const requestCode = () => {
    if (!collision || !captcha.token || busy || (challenge && resendRemaining > 0)) return;
    requestId.current ??= crypto.randomUUID();
    send.mutate({ phone_number: collision, request_id: requestId.current, turnstile_token: captcha.token });
  };
  const submit = form.handleSubmit((values) => {
    setMessage(null);
    if (!collision) { save.mutate(normalizePhone(values.phone_number)); return; }
    if (!challenge) { requestCode(); return; }
    if (!/^\d{6}$/.test(values.otp)) { form.setError("otp", { message: "Nhập mã OTP gồm 6 chữ số" }); return; }
    if (remaining <= 0) { setMessage("Mã đã hết hạn. Vui lòng gửi mã mới."); return; }
    confirm.mutate({ phone_number: collision, challenge_id: challenge.challenge_id, otp: values.otp });
  });
  return <form onSubmit={submit} className="space-y-4">
    <div ref={captcha.containerRef} hidden={!collision} />
    <div className="space-y-1"><label htmlFor="account-phone" className="text-sm">Số điện thoại</label><input id="account-phone" type="tel" inputMode="tel" autoComplete="tel-national" disabled={Boolean(collision) || busy} {...form.register("phone_number")} className="min-h-11 w-full rounded-xl border bg-background px-3 focus-visible:ring-2 focus-visible:ring-ring" />{form.formState.errors.phone_number ? <p className="text-xs text-destructive">{form.formState.errors.phone_number.message}</p> : null}</div>
    {collision ? <>
      <p className="text-sm text-muted-foreground">Số này có lịch sử mua tại quầy. Xác nhận mã OTP nhận qua Zalo để nhận lịch sử và điểm.</p>

      {captcha.status === "error" ? <Button type="button" variant="outline" onClick={captcha.reload}>Tải lại xác nhận</Button> : null}
      {challenge ? <><p className="text-sm">Nhập mã gửi qua Zalo tới {challenge.masked_phone}. {challenge.delivery_status === "unknown" ? "Chưa xác định được trạng thái gửi." : ""}</p><label htmlFor="account-phone-otp" className="block text-sm">Mã OTP</label><input id="account-phone-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} {...form.register("otp")} className="min-h-11 w-full rounded-xl border bg-background px-3" />{form.formState.errors.otp ? <p className="text-xs text-destructive">{form.formState.errors.otp.message}</p> : null}</> : null}
    </> : null}
    {message ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{message}</p>{collision ? <a href={SHOP_FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center rounded-xl border px-3 text-sm font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring">Nhờ cửa hàng hỗ trợ qua Facebook</a> : null}</div> : null}
    <Button type="submit" className="min-h-11 w-full" disabled={busy || Boolean(collision && !challenge && !captcha.token) || Boolean(challenge && remaining <= 0)}>{busy ? "Đang xác nhận…" : challenge ? "Xác nhận mã OTP" : collision ? "Gửi mã OTP qua Zalo" : "Lưu số điện thoại"}</Button>
    {collision ? <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => { setCollision(null); setChallenge(null); requestId.current = null; form.setValue("otp", ""); setMessage(null); }}>Sửa số điện thoại</Button> : null}
    {challenge ? <Button type="button" variant="outline" className="w-full" disabled={busy || !captcha.token || resendRemaining > 0} onClick={() => { requestId.current = null; requestCode(); }}>Gửi lại mã OTP</Button> : null}
  </form>;
}
