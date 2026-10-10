"use client";

import { normalizePhone } from "@/src/utils/phone";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/src/lib/store/authStore";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import {
  checkPhone,
  register as registerRequest,
  type RegisterPayload,
  type RegisterResult,
} from "@/src/services/authService";
import { resetForceLogout } from "@/src/lib/api/client";
import RegisterStepOne, {
  type RegisterStepOneValues,
} from "@/src/components/common/register/RegisterStepOne";
import RegisterStepTwo, {
  type RegisterStepTwoValues,
} from "@/src/components/common/register/RegisterStepTwo";
import { clearPrivateQueryCaches } from "@/src/lib/queryClient";
import { useRegistrationOtp, registrationOtpMessage } from "@/src/hooks/useRegistrationOtp";
import { useRegistrationTurnstile } from "@/src/hooks/useRegistrationTurnstile";
import RegisterOtpStep from "@/src/components/common/register/RegisterOtpStep";
import { getWelcomeRewardPreview, welcomeRewardKeys } from "@/src/services/welcomeRewardService";
import { Button } from "@/src/components/ui/button";

function payloadFingerprint(input: RegisterPayload): string {
  const phone = normalizePhone(input.phone_number);
  return JSON.stringify([phone, input.name, input.password, input.insta_name?.trim().replace(/^@/, "").toLowerCase() || null]);
}

/** Collect registration details, confirm an enabled OTP and open the existing welcome/session flow. */
const RegisterForm = ({ onRegistered }: { onRegistered: (result: RegisterResult) => void }) => {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [stepOne, setStepOne] = useState<RegisterStepOneValues | null>(null);
  const [stepTwo, setStepTwo] = useState<RegisterStepTwoValues | null>(null);
  const [challengeBinding, setChallengeBinding] = useState<{ id: string; fingerprint: string } | null>(null);
  const login = useAuthStore((state) => state.login);
  const switchTo = useAuthModalStore((state) => state.switchTo);
  const otp = useRegistrationOtp();
  const welcome = useQuery({ queryKey: welcomeRewardKeys.preview, queryFn: getWelcomeRewardPreview, staleTime: 0, gcTime: 0, refetchInterval: false, retry: false });
  const registration = useMutation({ mutationFn: registerRequest, retry: false });
  const enabled = otp.config.data?.enabled === true;
  const captcha = useRegistrationTurnstile(step === 1 ? undefined : otp.config.data?.turnstile?.site_key);
  const captchaReady = Boolean(captcha.token) || captcha.status === "error";
  const payload: RegisterPayload | null = stepOne && stepTwo ? {
    name: stepTwo.name, phone_number: stepOne.phone_number, password: stepOne.password,
    ...(stepTwo.insta_name ? { insta_name: stepTwo.insta_name } : {}),
  } : null;

  const usableChallenge = otp.challenge && payload && challengeBinding?.id === otp.challenge.challenge_id
    && challengeBinding.fingerprint === payloadFingerprint(payload) ? otp.challenge : null;

  const continueFromStepOne = async (values: RegisterStepOneValues): Promise<void> => {
    const result = await checkPhone(values.phone_number);
    if (result.exists) throw new Error("Số điện thoại này đã được đăng ký. Vui lòng đăng nhập.");
    setStepOne(values); setStep(2);
  };
  const createAccount = async (input: RegisterPayload): Promise<void> => {
    try {
      const user = await registration.mutateAsync(input);
      clearPrivateQueryCaches(queryClient);
      login(user.phone_number, user.name, user.qr_token); resetForceLogout(); otp.clear(); onRegistered(user);
    } catch (error) {
      void otp.config.refetch();
      throw error;
    }
  };
  const send = async (input: RegisterPayload): Promise<void> => {
    try {
      const challenge = await otp.send(input, captcha.token);
      setChallengeBinding({ id: challenge.challenge_id, fingerprint: payloadFingerprint(input) });
    }
    finally { captcha.reset(); }
  };
  const completeRegistration = async (values: RegisterStepTwoValues): Promise<void> => {
    if (!stepOne || !otp.config.data) return;
    setStepTwo(values);
    const input: RegisterPayload = {
      name: values.name, phone_number: stepOne.phone_number, password: stepOne.password,
      ...(values.insta_name ? { insta_name: values.insta_name } : {}),
    };
    if (!enabled) { await createAccount(input); return; }
    const resume = otp.challenge && challengeBinding?.id === otp.challenge.challenge_id
      && challengeBinding.fingerprint === payloadFingerprint(input);
    if (!resume) {
      if (!captchaReady) throw new Error("Vui lòng hoàn tất bước xác nhận trước khi gửi mã.");
      await send(input);
    }
    setStep(3);
  };

  const resumeRegistration = async (values: RegisterStepTwoValues): Promise<void> => {
    if (!stepOne || !otp.challenge) return;
    const input: RegisterPayload = { name: values.name, phone_number: stepOne.phone_number, password: stepOne.password,
      ...(values.insta_name ? { insta_name: values.insta_name } : {}) };
    setStepTwo(values);
    setChallengeBinding({ id: otp.challenge.challenge_id, fingerprint: payloadFingerprint(input) });
    setStep(3);
  };

  return <div className="space-y-5">
    {otp.config.isError ? <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{registrationOtpMessage(otp.config.error)}</p><Button variant="outline" onClick={() => void otp.config.refetch()}>Tải lại đăng ký</Button></div> : null}
    {step === 1 && otp.challenge ? <p className="text-sm text-muted-foreground">Bạn có mã xác nhận chưa hết hạn. Nhập lại đúng thông tin và mật khẩu đã dùng để gửi mã.</p> : null}
    {step === 1 ? <RegisterStepOne initialValues={stepOne ?? undefined} totalSteps={enabled ? 3 : 2} onContinue={continueFromStepOne} onLogin={() => switchTo("login")} />
      : step === 2 ? <RegisterStepTwo welcomeReward={welcome.isError ? undefined : welcome.data} initialValues={stepTwo ?? undefined} totalSteps={enabled ? 3 : 2}
        submitLabel={enabled ? usableChallenge ? "Nhập mã xác nhận" : "Gửi mã xác nhận" : "Đăng ký"}
        submitDisabled={otp.config.isPending || otp.config.isError || enabled && !usableChallenge && !captchaReady}
        onValuesChange={setStepTwo} onResume={enabled && otp.challenge && !usableChallenge ? resumeRegistration : undefined}
        onBack={() => setStep(1)} onSubmit={completeRegistration} onLogin={() => switchTo("login")} />
        : !enabled && payload ? <div className="space-y-3"><p className="text-sm">Hiện không cần mã xác nhận để đăng ký.</p><Button disabled={registration.isPending} className="w-full" onClick={() => void createAccount(payload).catch(() => undefined)}>Hoàn tất đăng ký</Button>{registration.error ? <p role="alert" className="text-sm text-destructive">{registrationOtpMessage(registration.error)}</p> : null}</div>
          : usableChallenge && payload ? <RegisterOtpStep key={usableChallenge.challenge_id} challenge={usableChallenge}
            resendPending={otp.delivery.isPending} resendError={otp.delivery.error} retryAt={otp.retryAt} resendAllowed={captchaReady}
            onBack={() => setStep(2)} onResend={() => send(payload)}
            onVerify={(code) => createAccount({ ...payload, challenge_id: usableChallenge.challenge_id, otp: code })} />
            : <div className="space-y-3"><p>Mã đã hết hạn. Vui lòng gửi mã mới.</p><Button variant="outline" onClick={() => setStep(2)}>Quay lại thông tin</Button></div>}
    {enabled && step === 3 ? <Button variant="ghost" disabled={otp.config.isFetching || otp.delivery.isPending || registration.isPending}
      onClick={() => void otp.config.refetch()}>Kiểm tra lại chế độ đăng ký</Button> : null}
    {enabled && step !== 1 ? <div className="space-y-2">
      <div ref={captcha.containerRef} className="min-h-16 overflow-hidden" />
      {captcha.status === "loading" ? <p role="status" className="text-xs text-muted-foreground">Đang tải bước xác nhận…</p> : null}
      {captcha.status === "error" ? <div className="space-y-2"><p className="text-xs text-muted-foreground">Bước xác nhận đang gián đoạn. Bạn có thể thử gửi mã.</p><Button variant="ghost" size="sm" onClick={captcha.reload}>Thử lại xác nhận</Button></div> : null}
    </div> : null}
  </div>;
};

export default RegisterForm;
