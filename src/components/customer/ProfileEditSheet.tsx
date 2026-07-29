"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Drawer } from "vaul";
import { AtSign, Eye, EyeOff, Lock, User, X } from "lucide-react";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { ProfileEditFooter } from "@/src/components/customer/profile/ProfileEditFooter";
import {
  ProfileFormField,
  profileInputClass,
} from "@/src/components/customer/profile/ProfileFormField";
import type { CustomerProfile, UpdateProfilePayload } from "@/src/lib/types/user";
import {
  profileEditFormSchema,
  type ProfileEditFormValues,
} from "@/src/lib/validations/auth";
import {
  buildProfilePatchPayload,
  hasProfileChanges,
  normalizeProfileInstagram,
} from "@/src/lib/utils/profileEdit";
import { formatVietnamPhone } from "@/src/utils/display";

interface ProfileEditSheetProps {
  open: boolean;
  profile: CustomerProfile;
  onClose: () => void;
  onSubmit: (payload: UpdateProfilePayload) => Promise<void>;
}

/** Mobile-first sheet for editing customer name and Instagram alias. */
export function ProfileEditSheet({
  open,
  profile,
  onClose,
  onSubmit,
}: ProfileEditSheetProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileEditFormValues>({
    resolver: zodResolver(profileEditFormSchema),
    mode: "onBlur",
    defaultValues: {
      name: profile.name,
      insta_name: profile.insta_name ?? "",
      current_password: "",
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: profile.name,
        insta_name: profile.insta_name ?? "",
        current_password: "",
      });
    }
  }, [open, profile, reset]);

  const watchedValues = useWatch({ control });
  const values: ProfileEditFormValues = {
    name: watchedValues.name ?? profile.name,
    insta_name: watchedValues.insta_name ?? profile.insta_name ?? "",
    current_password: watchedValues.current_password ?? "",
  };
  const dirty = hasProfileChanges(profile, values);
  const instagramChanged = useMemo(
    () =>
      (normalizeProfileInstagram(values.insta_name) || null) !==
      profile.insta_name,
    [profile.insta_name, values.insta_name],
  );

  const finishClose = () => {
    setServerError(null);
    setShowPassword(false);
    onClose();
  };

  const requestClose = () => {
    if (isSubmitting) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    finishClose();
  };

  const submit = async (formValues: ProfileEditFormValues) => {
    setServerError(null);
    if (
      instagramChanged &&
      formValues.current_password.trim().length < 6
    ) {
      setError("current_password", {
        message: "Nhập mật khẩu hiện tại để xác nhận thay đổi",
      });
      return;
    }

    try {
      await onSubmit(buildProfilePatchPayload(profile, formValues));
      finishClose();
    } catch (error: unknown) {
      const response = (
        error as {
          response?: {
            status?: number;
            data?: {
              error?: string;
              details?: { field?: string };
            };
          };
        }
      ).response;
      const message =
        response?.data?.error ?? "Không thể cập nhật thông tin. Vui lòng thử lại.";
      const field = response?.data?.details?.field;
      if (field === "insta_name" || response?.status === 409) {
        setError("insta_name", { message }, { shouldFocus: true });
      } else if (field === "current_password") {
        setError("current_password", { message }, { shouldFocus: true });
      } else {
        setServerError(message);
      }
    }
  };

  return (
    <>
      <Drawer.Root
        open={open}
        dismissible={!isSubmitting}
        onOpenChange={(nextOpen) => !nextOpen && requestClose()}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[90] bg-black/45" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-[91] mx-auto flex max-h-[90dvh] max-w-lg flex-col rounded-t-[2rem] bg-card shadow-2xl outline-none">
            <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-primary/20" />
            <header className="flex items-start justify-between gap-4 border-b border-border/60 px-5 pb-4 pt-3">
              <div>
                <Drawer.Title className="font-serif text-xl font-bold text-primary">
                  Chỉnh sửa thông tin
                </Drawer.Title>
                <Drawer.Description className="mt-1 text-sm text-muted-foreground">
                  Cập nhật tên hiển thị và Instagram đăng nhập.
                </Drawer.Description>
              </div>
              <button
                type="button"
                onClick={requestClose}
                disabled={isSubmitting}
                aria-label="Đóng"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <form
              onSubmit={handleSubmit(submit)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
                {serverError && (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                    {serverError}
                  </div>
                )}
                <ProfileFormField
                  id="profile-name"
                  label="Họ và tên"
                  icon={<User className="h-4 w-4" />}
                  error={errors.name?.message}
                >
                  <input
                    id="profile-name"
                    autoComplete="name"
                    {...register("name")}
                    className={profileInputClass(Boolean(errors.name))}
                  />
                </ProfileFormField>

                <ProfileFormField
                  id="profile-phone"
                  label="Số điện thoại"
                  icon={<Lock className="h-4 w-4" />}
                  helper="Chưa thể thay đổi số điện thoại trong phiên bản này."
                >
                  <input
                    id="profile-phone"
                    readOnly
                    value={formatVietnamPhone(profile.phone_number)}
                    className={`${profileInputClass(false)} cursor-not-allowed bg-muted/50 text-muted-foreground`}
                  />
                </ProfileFormField>

                <ProfileFormField
                  id="profile-instagram"
                  label="Tên Instagram"
                  icon={<AtSign className="h-4 w-4" />}
                  error={errors.insta_name?.message}
                  helper="Có thể dùng tên này cùng mật khẩu để đăng nhập."
                >
                  <input
                    id="profile-instagram"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="ten_instagram"
                    {...register("insta_name")}
                    className={profileInputClass(Boolean(errors.insta_name))}
                  />
                </ProfileFormField>

                <AnimatePresence initial={false}>
                  {instagramChanged && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <ProfileFormField
                        id="profile-password"
                        label="Mật khẩu hiện tại"
                        icon={<Lock className="h-4 w-4" />}
                        error={errors.current_password?.message}
                        helper="Cần xác nhận khi thêm, đổi hoặc xoá Instagram."
                      >
                        <input
                          id="profile-password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          {...register("current_password")}
                          className={profileInputClass(
                            Boolean(errors.current_password),
                            "pr-11",
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((shown) => !shown)}
                          aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                          className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </ProfileFormField>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <ProfileEditFooter
                dirty={dirty}
                submitting={isSubmitting}
                onCancel={requestClose}
              />
            </form>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <ConfirmModal
        isOpen={confirmDiscard}
        title="Bỏ thay đổi?"
        message="Các thông tin bạn vừa nhập sẽ không được lưu."
        confirmLabel="Bỏ thay đổi"
        cancelLabel="Tiếp tục sửa"
        isDestructive
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          finishClose();
        }}
      />
    </>
  );
}
