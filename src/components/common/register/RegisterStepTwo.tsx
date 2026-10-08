"use client";

import type { WelcomeRewardPreview } from "@/contracts/reward";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  AlertCircle,
  ArrowLeft,
  AtSign,
  Loader2,
  User,
} from "lucide-react";
import { ApiServiceError } from "@/src/lib/api/serviceError";
import { registrationOtpMessage } from "@/src/hooks/useRegistrationOtp";
import { registerFormSchema } from "@/src/lib/validations/auth";
import {
  Header,
  LoginLink,
} from "@/src/components/common/register/RegisterStepOne";

const schema = registerFormSchema.pick({ name: true, insta_name: true });
export type RegisterStepTwoValues = z.infer<typeof schema>;

interface RegisterStepTwoProps {
  welcomeReward?: WelcomeRewardPreview;
  initialValues?: RegisterStepTwoValues;
  totalSteps?: 2 | 3;
  submitLabel?: string;
  submitDisabled?: boolean;
  onValuesChange?: (values: RegisterStepTwoValues) => void;
  onResume?: (values: RegisterStepTwoValues) => Promise<void>;
  onBack: () => void;
  onSubmit: (values: RegisterStepTwoValues) => Promise<void>;
  onLogin: () => void;
}

/** Collect display name and optional Instagram alias. */
export default function RegisterStepTwo({
  welcomeReward, initialValues, totalSteps = 2, submitLabel = "Đăng ký", submitDisabled = false, onValuesChange, onResume,
  onBack,
  onSubmit,
  onLogin,
}: RegisterStepTwoProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<RegisterStepTwoValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: initialValues ?? { name: "", insta_name: "" },
  });

  const submit = async (values: RegisterStepTwoValues, resume = false) => {
    setServerError(null);
    try {
      await (resume && onResume ? onResume(values) : onSubmit(values));
    } catch (error: unknown) {
      const response = (
        error as {
          response?: { status?: number; data?: { error?: string } };
        }
      ).response;
      const message = error instanceof ApiServiceError ? registrationOtpMessage(error) : response?.data?.error ?? (error instanceof Error ? error.message : "Không thể tạo tài khoản.");
      if ((response?.status === 409 || error instanceof ApiServiceError && error.status === 409) && message.includes("Instagram")) {
        setError("insta_name", { message });
      } else {
        setServerError(message);
      }
    }
  };

  return (
    <>
      <Header step={2} total={totalSteps} />
      {serverError && (
        <div className="flex gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {serverError}
        </div>
      )}
      <form onSubmit={handleSubmit((values) => submit(values))} className="space-y-4">
        <label className="block space-y-1.5 text-sm font-medium">
          Họ và tên
          <span className="relative mt-1.5 block">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoComplete="name"
              placeholder="Bạn Cá"
              {...register("name", { onChange: (event) => onValuesChange?.({ ...getValues(), name: event.target.value }) })}
              className={inputClass(Boolean(errors.name))}
            />
          </span>
          {errors.name && (
            <span className="block text-xs text-destructive">
              {errors.name.message}
            </span>
          )}
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          Tên Instagram <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
          <span className="relative mt-1.5 block">
            <AtSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="ten_instagram"
              {...register("insta_name", { onChange: (event) => onValuesChange?.({ ...getValues(), insta_name: event.target.value }) })}
              className={inputClass(Boolean(errors.insta_name))}
            />
          </span>
          {errors.insta_name ? (
            <span className="block text-xs text-destructive">
              {errors.insta_name.message}
            </span>
          ) : (
            <span className="block text-xs font-normal text-muted-foreground">
              Có thể dùng tên này cùng mật khẩu để đăng nhập.
            </span>
          )}
        </label>
        <p className="text-center text-xs text-muted-foreground">
          {welcomeReward?.mode === "POINTS" ? <>Nhận <span className="font-semibold text-primary">{welcomeReward.points_amount} điểm cá</span> chào mừng khi đăng ký.</>
            : welcomeReward?.mode === "FIXED_VOUCHER" ? "Nhận voucher chào mừng khi đăng ký."
              : welcomeReward?.mode === "GACHA" ? "Đăng ký để chọn hộp quà và nhận voucher ngẫu nhiên."
                : "Quà chào mừng sẽ được xác nhận khi đăng ký thành công."}
        </p>
        {onResume ? <div className="space-y-2 rounded-xl border p-3 text-sm">
          <p>Nhập lại đúng thông tin đã dùng để gửi mã. Bạn có thể tiếp tục bằng mã đã nhận hoặc gửi mã mới.</p>
          <button type="button" disabled={isSubmitting} onClick={() => void handleSubmit((values) => submit(values, true))()}
            className="min-h-11 rounded-xl border px-4 font-medium">Dùng mã đã nhận</button>
        </div> : null}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className="flex h-11 items-center gap-1.5 rounded-xl border border-input px-4 text-sm font-medium text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </button>
          <button
            type="submit"
            disabled={isSubmitting || submitDisabled}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </form>
      <LoginLink onLogin={onLogin} />
    </>
  );
}

function inputClass(hasError: boolean): string {
  return `h-11 w-full rounded-xl border bg-background pl-9 pr-4 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 md:text-sm ${
    hasError ? "border-destructive focus:ring-destructive" : "border-input focus:ring-ring"
  }`;
}
