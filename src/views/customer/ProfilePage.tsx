"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  MapPin,
  QrCode,
  User,
  UserRoundPen,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CustomerQRDisplay } from "@/src/views/CustomerQRDisplay";
import { ProfilePointsHistory } from "@/src/views/customer/ProfilePointsHistory";
import { ProfileEditSheet } from "@/src/components/customer/ProfileEditSheet";
import { getProfile, updateProfile } from "@/src/services/profileService";
import { useAuthStore } from "@/src/lib/store/authStore";
import type {
  CustomerProfile,
  UpdateProfilePayload,
} from "@/src/lib/types/user";
import { formatVietnamPhone } from "@/src/utils/display";

const profileQueryKey = ["customer", "profile"] as const;

/** Customer account page with QR, points and editable profile details. */
export default function ProfilePage() {
  const [editOpen, setEditOpen] = useState(false);
  const queryClient = useQueryClient();
  const updateName = useAuthStore((state) => state.updateName);
  const {
    data: profile,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: profileQueryKey,
    queryFn: getProfile,
  });

  const saveProfile = async (
    payload: UpdateProfilePayload,
  ): Promise<void> => {
    const updated = await updateProfile(payload);
    queryClient.setQueryData<CustomerProfile>(profileQueryKey, updated);
    updateName(updated.name);
    toast.success("Đã cập nhật thông tin", { duration: 3500 });
  };

  if (isLoading) return <ProfileSkeleton />;
  if (isError || !profile) {
    return (
      <main className="container max-w-md px-4 py-10">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-5 text-center">
          <p className="text-sm text-destructive">
            Chưa thể tải thông tin tài khoản.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Thử lại
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="container max-w-md space-y-6 px-4 py-6 animate-fade-in">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-bold">Tài khoản của tôi</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý thông tin và mã QR tích điểm
        </p>
      </header>

      <section className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-4 border-b border-border/50 pb-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User size={28} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-medium">{profile.name}</h2>
            <p className="text-sm text-muted-foreground">
              {formatVietnamPhone(profile.phone_number)}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {profile.insta_name
                ? `@${profile.insta_name}`
                : "Chưa thêm Instagram"}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Cá của bạn
            </span>
            <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
              {profile.points_balance} 🐟
            </span>
          </div>
        </div>

        <nav className="space-y-1 pb-2 pt-2" aria-label="Tài khoản">
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.18 }}
            onClick={() => setEditOpen(true)}
            className="flex min-h-12 w-full items-center justify-between rounded-xl p-3 text-left transition-colors hover:bg-secondary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex items-center gap-3 text-primary">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <UserRoundPen size={20} />
              </span>
              <span className="text-[15px] font-medium">
                Chỉnh sửa thông tin
              </span>
            </span>
            <ChevronRight size={18} className="text-muted-foreground" />
          </motion.button>

          <Link
            href="/profile/addresses"
            className="flex min-h-12 items-center justify-between rounded-xl p-3 transition-colors hover:bg-secondary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex items-center gap-3 text-primary">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-orange-600">
                <MapPin size={20} />
              </span>
              <span className="text-[15px] font-medium">
                Sổ địa chỉ giao hàng
              </span>
            </span>
            <ChevronRight size={18} className="text-muted-foreground" />
          </Link>
          <ProfilePointsHistory />
        </nav>

        <div className="space-y-4 border-t border-border/50 pt-5">
          <div className="space-y-1 text-center">
            <h3 className="flex items-center justify-center gap-1.5 font-medium">
              <QrCode size={18} className="text-primary" />
              Mã QR Tích Điểm
            </h3>
            <p className="text-xs text-muted-foreground">
              Đưa mã này cho nhân viên khi thanh toán tại quầy
            </p>
          </div>
          <CustomerQRDisplay qrToken={profile.qr_token} />
        </div>
      </section>

      <ProfileEditSheet
        open={editOpen}
        profile={profile}
        onClose={() => setEditOpen(false)}
        onSubmit={saveProfile}
      />
    </main>
  );
}

function ProfileSkeleton() {
  return (
    <main
      className="container max-w-md space-y-6 px-4 py-6"
      aria-busy="true"
      aria-label="Đang tải tài khoản"
    >
      <div className="h-16 animate-pulse rounded-xl bg-muted" />
      <div className="h-[32rem] animate-pulse rounded-2xl border border-border bg-card" />
    </main>
  );
}
