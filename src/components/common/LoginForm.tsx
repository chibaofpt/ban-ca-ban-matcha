"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { AtSign, Lock, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuthStore } from "@/src/lib/store/authStore";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import { loginFormSchema, LoginFormValues as LoginInput } from "@/src/lib/validations/auth";
import { login as loginRequest, type LoginPayload } from "@/src/services/authService";
import { resetForceLogout } from "@/src/lib/api/client";
import { useQueryClient } from "@tanstack/react-query";
import { classifyLoginIdentifier } from "@/src/lib/utils/loginIdentifier";
import { clearPrivateQueryCaches } from "@/src/lib/queryClient";
import { Button } from "@/src/components/ui/button";

const LoginForm = ({ disabled = false, onBusyChange }: { disabled?: boolean; onBusyChange: (busy: boolean) => void }) => {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<"identifier" | "password">("identifier");

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    trigger,
    setFocus,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginFormSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      identifier: "",
      password: "",
    },
  });
  useEffect(() => {
    if (step === "password") setFocus("password");
  }, [step, setFocus]);
  useEffect(() => {
    onBusyChange(isSubmitting);
    return () => onBusyChange(false);
  }, [isSubmitting, onBusyChange]);

  const login = useAuthStore((s) => s.login);
  const close = useAuthModalStore((s) => s.close);
  const dismiss = useAuthModalStore((s) => s.dismiss);


  const onSubmit = async (data: LoginInput) => {
    if (disabled) return;
    setServerError(null);
    try {
      const identifier = classifyLoginIdentifier(data.identifier);
      const payload: LoginPayload =
        identifier.kind === "phone"
          ? { phone_number: identifier.value, password: data.password }
          : { insta_name: identifier.value, password: data.password };
      const user = await loginRequest(payload);
      clearPrivateQueryCaches(queryClient);

      const isStaffUser = user.role === "ADMIN" || user.role === "STAFF";
      const isOnMenu = pathname === "/" || pathname === "/menu";

      // Set auth state first so queries/UI update immediately.
      login(user.phone_number, user.name, user.qr_token);
      resetForceLogout(); // Allow force-logout to fire again after re-login (BUG-3)
      if (isStaffUser) {
        // Release focus and scroll lock before the admin shell navigation starts.
        dismiss();
        router.replace("/staff/orders");
        router.refresh();
      } else {
        if (!isOnMenu) {
          router.push("/menu");
          router.refresh();
        }
        close();
      }
    } catch (error) {
      const axiosError = error as { response?: { data?: { error?: string } } };
      setServerError(
        axiosError.response?.data?.error ?? "Lỗi không thể kết nối đến máy chủ"
      );
    }
  };

  return (
    <motion.div
      key="login"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.2 }}
      className="space-y-5"
    >
      {serverError && (
        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-xl flex items-center gap-2 border border-red-100">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={step === "password" ? handleSubmit(onSubmit) : (event) => {
        event.preventDefault();
        if (disabled) return;
        void trigger("identifier").then(valid => { if (valid) { clearErrors("password"); setStep("password"); } });
      }} className="space-y-4">
        <div className="space-y-1.5" hidden={step !== "identifier"}>
          <label htmlFor="login-identifier" className="text-sm font-medium text-foreground">
            Số điện thoại hoặc Instagram
          </label>
          <div className="relative">
            <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="login-identifier"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="091 234 5678 hoặc @ten_instagram"
              aria-invalid={Boolean(errors.identifier)}
              aria-describedby={errors.identifier ? "login-identifier-error" : undefined}
              {...register("identifier", {
                onChange: (event) => {
                  setValue("identifier", event.target.value, {
                    shouldValidate: true,
                  });
                },
                onBlur: () => window.scrollTo(0, 0)
              })}
              disabled={disabled || isSubmitting}
              className={`w-full h-11 pl-9 pr-4 rounded-xl border bg-background text-base md:text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 ${
                errors.identifier ? "border-red-500 focus:ring-red-500" : "border-input"
              }`}
            />
          </div>
          {errors.identifier && (
            <p id="login-identifier-error" className="text-xs text-red-500">{errors.identifier.message}</p>
          )}
        </div>

        {step === "password" ? <div className="flex items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2">
          <p className="min-w-0 break-words text-sm">Đăng nhập với <span className="font-medium">{getValues("identifier")}</span></p>
          <Button variant="ghost" className="shrink-0 px-3 text-sm" disabled={disabled || isSubmitting} onClick={() => {
            setStep("identifier"); setValue("password", ""); setShowPassword(false); setServerError(null); clearErrors();
            window.requestAnimationFrame(() => setFocus("identifier"));
          }}>Quay lại</Button>
        </div> : null}
        <div className="space-y-1.5" hidden={step !== "password"}>
          <label htmlFor="login-password" className="text-sm font-medium text-foreground">
            Mật khẩu
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              {...register("password", {
                onBlur: () => window.scrollTo(0, 0)
              })}
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "login-password-error" : undefined}
              disabled={disabled || isSubmitting}
              className={`w-full h-11 pl-9 pr-11 rounded-xl border bg-background text-base md:text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 ${
                errors.password ? "border-red-500 focus:ring-red-500" : "border-input"
              }`}
            />
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={(e) => { e.preventDefault(); setShowPassword(!showPassword); }}
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring z-10 cursor-pointer"
              disabled={disabled || isSubmitting}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          {errors.password && (
            <p id="login-password-error" className="text-xs text-red-500">{errors.password.message}</p>
          )}
        </div>

        <Button
          type="submit"
          disabled={disabled || isSubmitting}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {step === "identifier" ? "Tiếp tục" : "Đăng nhập"}
        </Button>
      </form>


    </motion.div>
  );
};

export default LoginForm;
