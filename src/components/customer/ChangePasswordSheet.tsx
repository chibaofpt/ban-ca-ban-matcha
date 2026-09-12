"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, KeyRound, Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import { Button } from "@/src/components/ui/button";
import {
  ProfileFormField,
  profileInputClass,
} from "@/src/components/customer/profile/ProfileFormField";
import type {
  ChangePasswordPayload,
} from "@/src/lib/types/user";
import { ApiServiceError } from "@/src/services/orderService";
import {
  changePasswordFormSchema,
  type ChangePasswordFormValues,
} from "@/src/lib/validations/auth";

interface ChangePasswordSheetProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: ChangePasswordPayload) => Promise<void>;
}

const EMPTY_VALUES: ChangePasswordFormValues = {
  current_password: "",
  new_password: "",
  confirm_password: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readApiServiceError(error: unknown): {
  status?: number;
  message?: string;
  field?: string;
} {
  if (!(error instanceof ApiServiceError)) return {};
  const details = isRecord(error.details) ? error.details : {};
  return {
    status: error.status,
    message: error.message,
    field: typeof details.field === "string" ? details.field : undefined,
  };
}

/** Renders the customer password-change form in the shared responsive overlay. */
export function ChangePasswordSheet({
  open,
  onClose,
  onSubmit,
}: ChangePasswordSheetProps) {
  const [showPasswords, setShowPasswords] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    mode: "onBlur",
    defaultValues: EMPTY_VALUES,
  });

  const clearSecrets = () => {
    reset(EMPTY_VALUES);
    setServerError(null);
    setShowPasswords(false);
  };

  const requestClose = () => {
    if (isSubmitting) return;
    clearSecrets();
    onClose();
  };

  const submit = async ({ current_password, new_password }: ChangePasswordFormValues) => {
    setServerError(null);
    try {
      await onSubmit({ current_password, new_password });
      clearSecrets();
      onClose();
    } catch (error: unknown) {
      const response = readApiServiceError(error);
      if (response.field === "current_password" || response.field === "new_password") {
        setError(response.field, {
          type: "server",
          message: response.message ?? "Dữ liệu không hợp lệ",
        }, { shouldFocus: true });
        return;
      }
      setServerError(
        response.status === 429
          ? "Bạn thao tác quá nhanh. Vui lòng thử lại sau."
          : response.message ?? "Không thể đổi mật khẩu. Vui lòng thử lại.",
      );
    }
  };

  const passwordType = showPasswords ? "text" : "password";
  const visibilityLabel = showPasswords ? "Ẩn mật khẩu" : "Hiện mật khẩu";

  return (
    <ResponsiveOverlay
      open={open}
      title="Đổi mật khẩu"
      description="Đặt mật khẩu mới để bảo vệ tài khoản của bạn."
      layer="critical"
      dismissPolicy={isSubmitting ? "locked-while-busy" : "default"}
      busy={isSubmitting}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) requestClose();
      }}
      onAfterClose={clearSecrets}
      footer={(
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={requestClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button type="submit" form="change-password-form" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Đang lưu" /> : "Lưu mật khẩu"}
          </Button>
        </div>
      )}
    >
      <form
        id="change-password-form"
        onSubmit={handleSubmit(submit)}
        className="space-y-4"
        noValidate
      >
        {serverError ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {serverError}
          </div>
        ) : null}

        <ProfileFormField
          id="change-password-current"
          label="Mật khẩu hiện tại"
          icon={<Lock className="h-4 w-4" />}
          error={errors.current_password?.message}
        >
          <input
            id="change-password-current"
            type={passwordType}
            autoComplete="current-password"
            aria-invalid={errors.current_password ? "true" : "false"}
            {...register("current_password")}
            className={profileInputClass(Boolean(errors.current_password), "pr-11")}
          />
          <button
            type="button"
            onClick={() => setShowPasswords((shown) => !shown)}
            aria-label={visibilityLabel}
            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </ProfileFormField>

        <ProfileFormField
          id="change-password-new"
          label="Mật khẩu mới"
          icon={<KeyRound className="h-4 w-4" />}
          error={errors.new_password?.message}
          helper="Ít nhất 6 ký tự, tối đa 72 byte UTF-8."
        >
          <input
            id="change-password-new"
            type={passwordType}
            autoComplete="new-password"
            aria-invalid={errors.new_password ? "true" : "false"}
            {...register("new_password")}
            className={profileInputClass(Boolean(errors.new_password), "pr-11")}
          />
          <button
            type="button"
            onClick={() => setShowPasswords((shown) => !shown)}
            aria-label={visibilityLabel}
            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </ProfileFormField>

        <ProfileFormField
          id="change-password-confirm"
          label="Xác nhận mật khẩu mới"
          icon={<KeyRound className="h-4 w-4" />}
          error={errors.confirm_password?.message}
        >
          <input
            id="change-password-confirm"
            type={passwordType}
            autoComplete="new-password"
            aria-invalid={errors.confirm_password ? "true" : "false"}
            {...register("confirm_password")}
            className={profileInputClass(Boolean(errors.confirm_password), "pr-11")}
          />
          <button
            type="button"
            onClick={() => setShowPasswords((shown) => !shown)}
            aria-label={visibilityLabel}
            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </ProfileFormField>
      </form>
    </ResponsiveOverlay>
  );
}
