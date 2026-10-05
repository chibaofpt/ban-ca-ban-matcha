"use client";

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RegisterPayload } from "@/contracts/auth";
import type { RegistrationOtpConfig, RegistrationOtpSend } from "@/contracts/registrationOtp";
import { ApiServiceError } from "@/src/lib/api/serviceError";
import { getRegistrationOtpConfig, registrationOtpKeys, sendRegistrationOtp } from "@/src/services/registrationOtpService";

interface OtpErrorDetails { reason?: string; retry_at?: string }

/** Render caller-facing OTP feedback while retaining structured service errors for decisions. */
export function registrationOtpMessage(error: unknown): string {
  const reason = error instanceof ApiServiceError ? (error.details as OtpErrorDetails | undefined)?.reason : undefined;
  const messages: Record<string, string> = {
    OTP_INVALID: "Mã xác nhận chưa đúng hoặc không khớp thông tin đăng ký.",
    OTP_EXPIRED: "Mã xác nhận đã hết hạn. Vui lòng gửi lại khi hết thời gian chờ.",
    OTP_REQUIRED: "Vui lòng xác nhận số điện thoại trước khi đăng ký.",
    OTP_USED: "Mã đã được sử dụng. Vui lòng đăng nhập hoặc gửi mã mới.",
    OTP_FLOW_REQUIRED: "Phiên đăng ký đã hết hạn. Vui lòng mở lại đăng ký.",
    OTP_LOCKED: "Bạn đã nhập sai mã quá nhiều lần. Vui lòng chờ trước khi thử lại.",
    OTP_BUSY: "Đang xử lý xác nhận. Vui lòng chờ rồi thử lại.",
    PHONE_LIMIT: "Chưa thể gửi lại mã cho số điện thoại này.",
    IP_LIMIT: "Đã đạt giới hạn gửi mã. Vui lòng chờ rồi thử lại.",
    DAILY_LIMIT: "Đã đạt giới hạn gửi mã hôm nay. Vui lòng quay lại sau.",
    TURNSTILE_REJECTED: "Vui lòng thực hiện lại bước xác nhận rồi gửi mã.",
    TURNSTILE_REQUIRED: "Vui lòng hoàn tất bước xác nhận trước khi gửi mã.",
    OTP_DISABLED: "Hiện không cần mã xác nhận. Vui lòng thử đăng ký lại.",
    SMS_PROVIDER_REJECTED: "Chưa gửi được mã xác nhận. Vui lòng thử lại sau thời gian chờ.",
    PHONE_ALREADY_REGISTERED: "Số điện thoại đã đăng ký. Vui lòng đăng nhập.",
    INSTAGRAM_ALREADY_USED: "Tên Instagram này đã được sử dụng.",
    ACCOUNT_BLOCKED: "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.",
  };
  if (reason && messages[reason]) return messages[reason];
  if (error instanceof ApiServiceError && error.status >= 500) return "Đăng ký đang tạm gián đoạn. Vui lòng thử lại.";
  return error instanceof Error ? error.message : "Thao tác chưa thành công. Vui lòng thử lại.";
}

/** Read the authoritative retry instant carried by a rate-limit response. */
export function registrationOtpRetryAt(error: unknown): string | undefined {
  return error instanceof ApiServiceError ? (error.details as OtpErrorDetails | undefined)?.retry_at : undefined;
}

/** Own server config/challenge state and preserve request ownership across uncertain network retries. */
export function useRegistrationOtp() {
  const client = useQueryClient();
  const owner = useRef<{ id: string; fingerprint: string } | null>(null);
  const config = useQuery({
    queryKey: registrationOtpKeys.config, queryFn: getRegistrationOtpConfig,
    staleTime: 0, gcTime: 0, retry: false, refetchInterval: false,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const delivery = useMutation({
    mutationFn: sendRegistrationOtp,
    onSuccess: (challenge) => {
      owner.current = null;
      client.setQueryData<RegistrationOtpConfig>(registrationOtpKeys.config, (previous) => previous ? { ...previous, challenge } : previous);
    },
    onError: (error) => {
      // A known server outcome is final; a transport failure keeps the same request_id.
      if (error instanceof ApiServiceError) owner.current = null;
      void config.refetch();
    },
  });
  async function send(payload: RegisterPayload, token: string) {
    await client.cancelQueries({ queryKey: registrationOtpKeys.config });
    const fingerprint = JSON.stringify(payload);
    if (!owner.current || owner.current.fingerprint !== fingerprint) {
      owner.current = { id: crypto.randomUUID(), fingerprint };
    }
    const input: RegistrationOtpSend = { ...payload, request_id: owner.current.id, turnstile_token: token };
    return delivery.mutateAsync(input);
  }
  return {
    config, delivery, send, challenge: config.data?.challenge ?? null,
    retryAt: registrationOtpRetryAt(delivery.error),
    clear: () => client.removeQueries({ queryKey: registrationOtpKeys.config }),
  };
}
