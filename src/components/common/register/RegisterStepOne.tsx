"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Phone,
} from "lucide-react";
import { registerFormSchema } from "@/src/lib/validations/auth";

const schema = registerFormSchema.pick({
  phone_number: true,
  password: true,
});
export type RegisterStepOneValues = z.infer<typeof schema>;

interface RegisterStepOneProps {
  onContinue: (values: RegisterStepOneValues) => Promise<void>;
  onLogin: () => void;
}

/** Collect phone and password for the first registration step. */
export default function RegisterStepOne({
  onContinue,
  onLogin,
}: RegisterStepOneProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterStepOneValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { phone_number: "", password: "" },
  });

  const submit = async (values: RegisterStepOneValues) => {
    setServerError(null);
    try {
      await onContinue(values);
    } catch (error: unknown) {
      const axiosError = error as {
        response?: { data?: { error?: string } };
      };
      setServerError(
        axiosError.response?.data?.error ??
          (error instanceof Error
            ? error.message
            : "Không thể kiểm tra số điện thoại. Vui lòng thử lại."),
      );
    }
  };

  return (
    <>
      <Header step={1} />
      {serverError && <ErrorBanner message={serverError} />}
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <Field label="Số điện thoại" error={errors.phone_number?.message}>
          <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="tel"
            autoComplete="tel"
            placeholder="091 234 5678"
            {...register("phone_number", {
              onChange: (event) =>
                setValue(
                  "phone_number",
                  event.target.value.replace(/\s+/g, ""),
                  { shouldValidate: true },
                ),
            })}
            className={inputClass(Boolean(errors.phone_number))}
          />
        </Field>
        <Field label="Mật khẩu" error={errors.password?.message}>
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="••••••••"
            {...register("password")}
            className={inputClass(Boolean(errors.password), "pr-11")}
          />
          <PasswordToggle
            shown={showPassword}
            onToggle={() => setShowPassword((shown) => !shown)}
          />
        </Field>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-60"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? "Đang kiểm tra..." : "Tiếp theo →"}
        </button>
      </form>
      <LoginLink onLogin={onLogin} />
    </>
  );
}

function Header({ step }: { step: 1 | 2 }) {
  return (
    <div className="space-y-2 text-center">
      <div className="flex items-center justify-center gap-2">
        {[1, 2].map((number) => (
          <div key={number} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                step >= number
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {number}
            </span>
            {number === 1 && (
              <span
                className={`h-px w-8 ${
                  step === 2 ? "bg-primary" : "bg-border"
                }`}
              />
            )}
          </div>
        ))}
      </div>
      <h2 className="font-playfair text-2xl font-bold">Tạo tài khoản</h2>
      <p className="text-sm text-muted-foreground">
        Bước {step} / 2 — {step === 1 ? "Thông tin đăng nhập" : "Thông tin cá nhân"}
      </p>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      {label}
      <span className="relative mt-1.5 block">{children}</span>
      {error && <span className="block text-xs text-destructive">{error}</span>}
    </label>
  );
}

function inputClass(hasError: boolean, extra = ""): string {
  return `h-11 w-full rounded-xl border bg-background pl-9 pr-4 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 md:text-sm ${
    hasError ? "border-destructive focus:ring-destructive" : "border-input focus:ring-ring"
  } ${extra}`;
}

function PasswordToggle({
  shown,
  onToggle,
}: {
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
      className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

function LoginLink({ onLogin }: { onLogin: () => void }) {
  return (
    <p className="text-center text-sm text-muted-foreground">
      Đã có tài khoản?{" "}
      <button
        type="button"
        onClick={onLogin}
        className="font-medium text-primary hover:underline"
      >
        Đăng nhập
      </button>
    </p>
  );
}

export { ErrorBanner, Header, LoginLink };
