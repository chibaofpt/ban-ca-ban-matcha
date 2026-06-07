import { redirect } from "next/navigation";
import Link from "next/link";
import { QrCode, User, MapPin, ChevronRight } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CustomerQRDisplay } from "@/src/views/CustomerQRDisplay";

export const metadata = {
  title: "Tài khoản của tôi | Bạn Cá Bán Matcha",
  description: "Mở mã QR cá nhân để tích điểm và sử dụng voucher",
};

export default async function ProfilePage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?callbackUrl=/profile");
  }

  // Fetch user data including qr_token
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      name: true,
      phone_number: true,
      points_balance: true,
      qr_token: true,
    },
  });

  if (!user || !user.qr_token) {
    // Edge case if user deleted or missing qr_token
    redirect("/");
  }

  return (
    <div className="container max-w-md py-6 space-y-6 animate-fade-in px-4">
      <div className="space-y-1">
        <h1 className="font-serif text-2xl font-bold">Tài khoản của tôi</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý thông tin và mã QR tích điểm
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-5 shadow-sm">
        {/* User Info */}
        <div className="flex items-center gap-4 border-b border-border/50 pb-5">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <User size={28} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-medium text-lg truncate">{user.name}</h2>
            <p className="text-sm text-muted-foreground">{user.phone_number}</p>
          </div>
          <div className="text-right shrink-0">
            <span className="block text-xs text-muted-foreground uppercase tracking-wide font-medium">
              Cá của bạn
            </span>
            <span className="font-bold text-lg text-amber-600 dark:text-amber-400">
              {user.points_balance} 🐟
            </span>
          </div>
        </div>

        {/* Menu Actions */}
        <div className="pt-2 pb-2">
          <Link
            href="/profile/addresses"
            className="flex items-center justify-between p-3 rounded-xl hover:bg-secondary/10 transition-colors"
          >
            <div className="flex items-center gap-3 text-primary">
              <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-600">
                <MapPin size={20} />
              </div>
              <div className="font-medium text-[15px]">Sổ địa chỉ giao hàng</div>
            </div>
            <ChevronRight size={18} className="text-muted-foreground" />
          </Link>
        </div>

        {/* QR Section */}
        <div className="space-y-4 border-t border-border/50 pt-5">
          <div className="text-center space-y-1">
            <h3 className="font-medium flex items-center justify-center gap-1.5">
              <QrCode size={18} className="text-primary" />
              Mã QR Tích Điểm
            </h3>
            <p className="text-xs text-muted-foreground">
              Đưa mã này cho nhân viên khi thanh toán tại quầy
            </p>
          </div>

          <CustomerQRDisplay qrToken={user.qr_token} />
        </div>
      </div>
    </div>
  );
}
