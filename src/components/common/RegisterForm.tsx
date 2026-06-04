"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Phone, Lock, User, Loader2, AlertCircle, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuthStore } from "@/src/lib/store/authStore";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import { registerFormSchema } from "@/src/lib/validations/auth";
import { z } from "zod";

const RegisterStep1Schema = registerFormSchema.pick({ phone_number: true, password: true });
const RegisterStep2Schema = registerFormSchema.pick({ name: true });
type RegisterStep1Input = z.infer<typeof RegisterStep1Schema>;
type RegisterStep2Input = z.infer<typeof RegisterStep2Schema>;
import {
  checkPhone,
  register as registerRequest,
  type RegisterPayload,
} from "@/src/services/authService";

/** 2-step registration wizard: step 1 = phone + password, step 2 = name. */
const RegisterForm = () => {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [step1Data, setStep1Data] = useState<RegisterStep1Input | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);
  const [phoneTakenError, setPhoneTakenError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const login = useAuthStore((s) => s.login);
  const close = useAuthModalStore((s) => s.close);
  const switchTo = useAuthModalStore((s) => s.switchTo);

  /* ── Step 1 form ─────────────────────────────────────────────────── */
  const {
    register: reg1,
    handleSubmit: handleSubmit1,
    setValue: setValue1,
    formState: { errors: errors1 },
  } = useForm<RegisterStep1Input>({
    resolver: zodResolver(RegisterStep1Schema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: { phone_number: "", password: "" },
  });

  /* ── Step 2 form ─────────────────────────────────────────────────── */
  const {
    register: reg2,
    handleSubmit: handleSubmit2,
    formState: { errors: errors2 },
  } = useForm<RegisterStep2Input>({
    resolver: zodResolver(RegisterStep2Schema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: { name: "" },
  });

  /* ── Handlers ────────────────────────────────────────────────────── */
  /** Advance from step 1 → step 2 (with server-side phone availability check). */
  const onStep1Valid = async (data: RegisterStep1Input) => {
    setPhoneTakenError(null);
    setServerError(null);
    setIsCheckingPhone(true);

    try {
      const result = await checkPhone(data.phone_number);

      if (result.exists) {
        setPhoneTakenError("Số điện thoại này đã được đăng ký. Vui lòng đăng nhập.");
        return;
      }

      setStep1Data(data);
      setStep(2);
    } catch (error) {
      const axiosError = error as { response?: { data?: { error?: string } } };
      setServerError(
        axiosError.response?.data?.error ?? "Không thể kiểm tra số điện thoại. Vui lòng thử lại."
      );
    } finally {
      setIsCheckingPhone(false);
    }
  };

  /** Final submit: merge step 1 + step 2 data and POST to API. */
  const onStep2Valid = async (data: RegisterStep2Input) => {
    if (!step1Data) return;
    setServerError(null);
    setIsSubmitting(true);

    try {
      const payload: RegisterPayload = {
        name: data.name,
        phone_number: step1Data.phone_number,
        password: step1Data.password,
      };
      const user = await registerRequest(payload);

      login(user.phone_number, user.name);
      close();

      const from = new URLSearchParams(window.location.search).get("from");
      if (from) router.push(from);
    } catch (error) {
      const axiosError = error as { response?: { data?: { error?: string } } };
      setServerError(
        axiosError.response?.data?.error ?? "Lỗi không thể kết nối đến máy chủ"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── Shared error banner ─────────────────────────────────────────── */
  const ErrorBanner = ({ message }: { message: string }) => (
    <div className="p-3 text-sm text-red-600 bg-red-50 rounded-xl flex items-center gap-2 border border-red-100">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );

  /* ── Step indicator ──────────────────────────────────────────────── */
  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-1">
      {[1, 2].map((n) => (
        <div key={n} className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors duration-300 ${step >= n
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
              }`}
          >
            {n}
          </div>
          {n < 2 && (
            <div
              className={`h-px w-8 transition-colors duration-300 ${step > n ? "bg-primary" : "bg-border"
                }`}
            />
          )}
        </div>
      ))}
    </div>
  );

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="text-center space-y-2">
        <StepIndicator />
        <h2 className="font-playfair text-2xl font-bold text-foreground">
          Tạo tài khoản
        </h2>
        <p className="text-muted-foreground text-sm">
          {step === 1 ? "Bước 1 / 2 — Thông tin đăng nhập" : "Bước 2 / 2 — Họ và tên của bạn"}
        </p>
      </div>

      {serverError && <ErrorBanner message={serverError} />}

      <AnimatePresence mode="wait">
        {/* ── STEP 1 ───────────────────────────────────────────────── */}
        {step === 1 && (
          <motion.form
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            onSubmit={handleSubmit1(onStep1Valid)}
            className="space-y-4"
          >
            {/* Phone */}
            <div className="space-y-1.5">
              <label htmlFor="register-phone" className="text-sm font-medium text-foreground">
                Số điện thoại
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  id="register-phone"
                  type="tel"
                  placeholder="091 234 5678"
                  {...reg1("phone_number", {
                    onChange: (e) => {
                      /** Strip whitespace so "091 234 5678" → "0912345678" */
                      const cleaned = e.target.value.replace(/\s+/g, "");
                      setValue1("phone_number", cleaned, { shouldValidate: true });
                      // Clear server-side "phone taken" error when user edits the number
                      setPhoneTakenError(null);
                    },
                  })}
                  className={`w-full h-11 pl-9 pr-4 rounded-xl border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${errors1.phone_number ? "border-red-500 focus:ring-red-500" : "border-input"
                    }`}
                />
              </div>
              {errors1.phone_number && (
                <p className="text-xs text-red-500">{errors1.phone_number.message}</p>
              )}
              {!errors1.phone_number && phoneTakenError && (
                <p className="text-xs text-red-500">{phoneTakenError}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="register-password" className="text-sm font-medium text-foreground">
                Mật khẩu
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  id="register-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  {...reg1("password")}
                  className={`w-full h-11 pl-9 pr-10 rounded-xl border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${errors1.password ? "border-red-500 focus:ring-red-500" : "border-input"
                    }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors1.password && (
                <p className="text-xs text-red-500">{errors1.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isCheckingPhone}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:pointer-events-none"
            >
              {isCheckingPhone && <Loader2 className="h-4 w-4 animate-spin" />}
              {isCheckingPhone ? "Đang kiểm tra..." : "Tiếp theo →"}
            </button>
          </motion.form>
        )}

        {/* ── STEP 2 ───────────────────────────────────────────────── */}
        {step === 2 && (
          <motion.form
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            onSubmit={handleSubmit2(onStep2Valid)}
            className="space-y-4"
          >
            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="register-name" className="text-sm font-medium text-foreground">
                Họ và tên
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  id="register-name"
                  type="text"
                  placeholder="Bạn cá bán matchaaa"
                  {...reg2("name")}
                  disabled={isSubmitting}
                  className={`w-full h-11 pl-9 pr-4 rounded-xl border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 ${errors2.name ? "border-red-500 focus:ring-red-500" : "border-input"
                    }`}
                />
              </div>
              {errors2.name && (
                <p className="text-xs text-red-500">{errors2.name.message}</p>
              )}
            </div>

            {/* Welcome bonus hint */}
            <p className="text-xs text-muted-foreground text-center">
              🎁 Bạn sẽ nhận được <span className="font-semibold text-primary">5 điểm</span> chào mừng sau khi đăng ký thành công!
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={isSubmitting}
                className="h-11 px-4 rounded-xl border border-input text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <ArrowLeft className="h-4 w-4" />
                Quay lại
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Đăng ký
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <p className="text-center text-sm text-muted-foreground">
        Đã có tài khoản?{" "}
        <button
          type="button"
          onClick={() => switchTo("login")}
          className="text-primary font-medium hover:underline"
        >
          Đăng nhập
        </button>
      </p>
    </div>
  );
};

export default RegisterForm;
