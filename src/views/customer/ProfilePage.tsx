"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  History,
  MapPin,
  Pencil,
  QrCode,
  Ticket,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AddressBookSheetContainer } from "@/src/views/customer/AddressBookSheetContainer";
import { ProfileQRSheet } from "@/src/components/customer/ProfileQRSheet";
import { ProfileEditSheet } from "@/src/components/customer/ProfileEditSheet";
import VoucherModal from "@/src/components/shared/VoucherModal";
import { getProfile, updateProfile } from "@/src/services/profileService";
import { useAuthStore } from "@/src/lib/store/authStore";
import type {
  CustomerProfile,
  UpdateProfilePayload,
} from "@/src/lib/types/user";
import { formatVietnamPhone } from "@/src/utils/display";
import { useVoucherModalStore } from "@/src/lib/store/voucherModalStore";

const profileQueryKey = ["customer", "profile"] as const;

/** Customer account page with QR, points and editable profile details. */
export default function ProfilePage() {
  const [editOpen, setEditOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [addressBookOpen, setAddressBookOpen] = useState(false);
  const openVoucherModal = useVoucherModalStore((state) => state.openModal);
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
      <main className="container max-w-md px-4 py-10 touch-pan-y overflow-x-clip overscroll-x-none">
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
    <main className="container max-w-md space-y-6 px-4 py-6 animate-fade-in touch-pan-y overflow-x-clip overscroll-x-none">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-bold">Tài khoản của tôi</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý thông tin và mã QR tích điểm
        </p>
      </header>

      <section className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3 border-b border-border/50 pb-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <h2 className="truncate text-lg font-medium">{profile.name}</h2>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                aria-label="Chỉnh sửa thông tin tài khoản"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatVietnamPhone(profile.phone_number)}
            </p>
            {profile.insta_name ? (
              <p className="truncate text-xs text-muted-foreground">
                @{profile.insta_name}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="min-h-11 text-xs font-medium text-primary/70 underline decoration-primary/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Thêm Instagram
              </button>
            )}
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
          <motion.div whileTap={{ scale: 0.98 }} transition={{ duration: 0.18 }}>
            <Link
              href="/history?tab=points"
              className="flex min-h-12 items-center justify-between rounded-xl p-3 transition-colors hover:bg-secondary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-3 text-primary">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                  <History size={20} />
                </span>
                <span className="text-[15px] font-medium">Lịch sử điểm</span>
              </span>
              <ChevronRight size={18} className="text-muted-foreground" />
            </Link>
          </motion.div>

          <ProfileActionRow
            label="Voucher của tôi"
            icon={<Ticket size={20} />}
            iconClassName="bg-amber-50 text-amber-700"
            onClick={openVoucherModal}
          />
          <ProfileActionRow
            label="Xem mã QR"
            icon={<QrCode size={20} />}
            iconClassName="bg-emerald-50 text-emerald-700"
            onClick={() => setQrOpen(true)}
          />
          <ProfileActionRow
            label="Sổ địa chỉ giao hàng"
            icon={<MapPin size={20} />}
            iconClassName="bg-orange-50 text-orange-700"
            onClick={() => setAddressBookOpen(true)}
          />
        </nav>
      </section>

      <ProfileEditSheet
        open={editOpen}
        profile={profile}
        onClose={() => setEditOpen(false)}
        onSubmit={saveProfile}
      />
      <ProfileQRSheet open={qrOpen} qrToken={profile.qr_token} onOpenChange={setQrOpen} />
      <AddressBookSheetContainer open={addressBookOpen} onOpenChange={setAddressBookOpen} />
      <VoucherModal />
    </main>
  );
}

interface ProfileActionRowProps {
  label: string;
  icon: ReactNode;
  iconClassName: string;
  onClick: () => void;
}

function ProfileActionRow({
  label,
  icon,
  iconClassName,
  onClick,
}: ProfileActionRowProps) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.18 }}
      onClick={onClick}
      className="flex min-h-12 w-full items-center justify-between rounded-xl p-3 text-left transition-colors hover:bg-secondary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-center gap-3 text-primary">
        <span className={`flex h-10 w-10 items-center justify-center rounded-full ${iconClassName}`}>
          {icon}
        </span>
        <span className="text-[15px] font-medium">{label}</span>
      </span>
      <ChevronRight size={18} className="text-muted-foreground" />
    </motion.button>
  );
}

function ProfileSkeleton() {
  return (
    <main
      className="container max-w-md space-y-6 px-4 py-6 touch-pan-y overflow-x-clip overscroll-x-none"
      aria-busy="true"
      aria-label="Đang tải tài khoản"
    >
      <div className="h-16 animate-pulse rounded-xl bg-muted" />
      <div className="h-[32rem] animate-pulse rounded-2xl border border-border bg-card" />
    </main>
  );
}
