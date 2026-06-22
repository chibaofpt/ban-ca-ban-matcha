"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Phone, Lock, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuthStore } from "@/src/lib/store/authStore";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import { loginFormSchema, LoginFormValues as LoginInput } from "@/src/lib/validations/auth";
import { login as loginRequest, type LoginPayload } from "@/src/services/authService";
import { resetForceLogout } from "@/src/lib/api/client";

const LoginForm = () => {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginFormSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: {
      phone_number: "",
      password: "",
    },
  });

  const login = useAuthStore((s) => s.login);
  const close = useAuthModalStore((s) => s.close);
  const switchTo = useAuthModalStore((s) => s.switchTo);

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);
    try {
      const payload: LoginPayload = {
        phone_number: data.phone_number,
        password: data.password,
      };
      const user = await loginRequest(payload);

      // Thực hiện điều hướng TRƯỚC KHI đóng modal để tránh lỗi component bị unmount làm hủy lệnh router
      if (user.role === "ADMIN" || user.role === "STAFF") {
        // Đối với Staff/Admin, dùng window.location.href để chuyển hẳn sang phân hệ quản lý
        // Đảm bảo không bị kẹt layout hay navbar của Customer.
        window.location.href = "/staff/orders";
      } else {
        // Đối với Customer, giữ nguyên trải nghiệm SPA mượt mà
        router.push("/menu");
        router.refresh();
      }

      // Cập nhật state và đóng modal sau
      login(user.phone_number, user.name);
      resetForceLogout(); // Allow force-logout to fire again after re-login (BUG-3)
      close();
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
      <div className="text-center space-y-1">
        <h2 className="font-playfair text-2xl font-bold text-foreground">
          Đăng nhập
        </h2>
        <p className="text-muted-foreground text-sm">
          Chào mừng bạn trở lại Bạn Cá Bán Matcha
        </p>
      </div>

      {serverError && (
        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-xl flex items-center gap-2 border border-red-100">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="login-phone" className="text-sm font-medium text-foreground">
            Số điện thoại
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="login-phone"
              type="tel"
              placeholder="091 234 5678"
              {...register("phone_number", {
                onChange: (e) => {
                  /** Strip whitespace so "091 234 5678" → "0912345678" before Zod sees it */
                  const cleaned = e.target.value.replace(/\s+/g, "");
                  setValue("phone_number", cleaned, { shouldValidate: true });
                },
                onBlur: () => window.scrollTo(0, 0)
              })}
              disabled={isSubmitting}
              className={`w-full h-11 pl-9 pr-4 rounded-xl border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 ${
                errors.phone_number ? "border-red-500 focus:ring-red-500" : "border-input"
              }`}
            />
          </div>
          {errors.phone_number && (
            <p className="text-xs text-red-500">{errors.phone_number.message}</p>
          )}
        </div>


        <div className="space-y-1.5">
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
              disabled={isSubmitting}
              className={`w-full h-11 pl-9 pr-10 rounded-xl border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 ${
                errors.password ? "border-red-500 focus:ring-red-500" : "border-input"
              }`}
            />
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setShowPassword(!showPassword); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none z-10 cursor-pointer"
              disabled={isSubmitting}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-red-500">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Đăng nhập
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Chưa có tài khoản?{" "}
        <button
          type="button"
          onClick={() => switchTo("register")}
          className="text-primary font-medium hover:underline"
        >
          Đăng ký ngay
        </button>
      </p>
    </motion.div>
  );
};

export default LoginForm;
