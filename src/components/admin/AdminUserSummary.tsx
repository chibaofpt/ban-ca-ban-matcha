import { motion } from "framer-motion";
import type { AdminUserSummary as AdminUserSummaryDto } from "@/src/lib/types/adminUser";
import { cn } from "@/src/utils/cn";

interface AdminUserSummaryProps {
  user: AdminUserSummaryDto;
  interactive?: boolean;
  onClick?: () => void;
}

const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

/** Displays the canonical admin customer identity and yearly value summary. */
export function AdminUserSummary({ user, interactive = false, onClick }: AdminUserSummaryProps) {
  const body = (
    <div className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left">
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground">{user.name}</p>
        <p className="truncate text-sm text-muted-foreground">{user.phone_number}{user.insta_name ? ` · @${user.insta_name.replace(/^@/, "")}` : ""}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {!user.is_registered ? <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">Chưa đăng ký</span> : null}
          <span className={cn("rounded-full px-2 py-1", user.is_verified ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>{user.is_verified ? "Đã xác thực" : "Chưa xác thực"}</span>
          {user.is_blocked ? <span className="rounded-full bg-destructive/10 px-2 py-1 text-destructive">Đã chặn</span> : null}
        </div>
      </div>
      <div className="max-w-[48%] shrink-0 text-right">
        <p className="font-bold text-primary">{money.format(user.annual_spend_vnd)}</p>
        <p className="text-xs text-muted-foreground">Chi tiêu matcha {user.spending_year}</p>
        <p className="mt-1 text-sm font-medium text-foreground">{user.points_balance.toLocaleString("vi-VN")} điểm</p>
        <p className="max-w-48 text-xs text-muted-foreground">Đã sử dụng {user.points_spent.toLocaleString("vi-VN")} điểm đổi {user.vouchers_exchanged.toLocaleString("vi-VN")} vouchers</p>
      </div>
    </div>
  );
  if (!interactive) return body;
  return <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={onClick} className="flex w-full rounded-2xl border border-border bg-card p-4 shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">{body}</motion.button>;
}
