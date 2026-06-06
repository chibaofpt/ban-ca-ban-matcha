import { redirect } from "next/navigation";
import { QrCode, User } from "lucide-react";
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

        {/* QR Section */}
        <div className="space-y-4">
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
