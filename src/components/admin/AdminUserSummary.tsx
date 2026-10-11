import { formatKa, formatVietnamPhone } from "@/src/utils/display";
import { motion } from "framer-motion";
import type { AdminUserSummary as AdminUserSummaryDto } from "@/src/lib/types/adminUser";

interface AdminUserSummaryProps {
  user: AdminUserSummaryDto;
  interactive?: boolean;
  onClick?: () => void;
}

/** Displays available customer contacts as naturally wrapping matcha badges. */
export function AdminUserContacts({ user }: { user: AdminUserSummaryDto }) {
  const contacts = [user.phone_number ? formatVietnamPhone(user.phone_number) : null,
    user.insta_name ? `@${user.insta_name.replace(/^@/, "")}` : null, user.email].filter(Boolean);
  return <span className="flex min-w-0 flex-wrap gap-2 text-xs">
    {contacts.map((contact, index) => <span key={index} className="max-w-full rounded-full bg-primary px-2 py-1 text-primary-foreground [overflow-wrap:anywhere]">{contact}</span>)}
  </span>;
}

/** Displays the canonical admin customer identity and yearly value summary. */
export function AdminUserSummary({ user, interactive = false, onClick }: AdminUserSummaryProps) {
  const body = (
    <div className="min-w-0 flex-1 space-y-2 text-left">
      {interactive ? <>
        <div className="flex min-w-0 items-baseline gap-2">
          <p className="min-w-0 flex-1 truncate font-semibold text-foreground" title={user.name}>{user.name}</p>
          <p className="shrink-0 whitespace-nowrap font-bold text-primary">{formatKa(user.annual_spend_vnd)}</p>
        </div>
        <AdminUserContacts user={user} />
        <div className="flex items-center gap-2">
          <p className="whitespace-nowrap text-sm font-medium text-primary sm:text-base">Số điểm: <span className="font-bold">{user.points_balance.toLocaleString("vi-VN")}</span> điểm ká</p>
          {!user.is_verified ? <span className="shrink-0 whitespace-nowrap rounded-full bg-destructive/10 px-2 py-1 text-[10px] text-destructive sm:text-xs">Chưa xác thực</span> : null}
        </div>
      </> : <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2">
        <div className="min-w-0 rounded-xl border border-primary p-3">
          <p className="text-sm text-muted-foreground">Đã chi</p>
          <p className="break-words text-lg font-bold text-primary">{formatKa(user.annual_spend_vnd)}</p>
        </div>
        <div className="min-w-0 rounded-xl border border-primary p-3">
          <p className="text-sm text-muted-foreground">Số điểm</p>
          <p className="break-words font-bold text-primary">{user.points_balance.toLocaleString("vi-VN")} điểm ká</p>
        </div>
      </div>}
      <div className="flex flex-wrap gap-2 text-xs">
        {!user.is_registered ? <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">Chưa đăng ký</span> : null}
        {!interactive && !user.is_verified ? <span className="rounded-full bg-destructive/10 px-2 py-1 text-destructive">Chưa xác thực</span> : null}
        {user.is_blocked ? <span className="rounded-full bg-destructive/10 px-2 py-1 text-destructive">Đã chặn</span> : null}
      </div>
      <p className="text-xs text-muted-foreground">Đã sử dụng {user.points_spent.toLocaleString("vi-VN")} điểm đổi {user.vouchers_exchanged.toLocaleString("vi-VN")} vouchers</p>
    </div>
  );
  if (!interactive) return body;
  return <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={onClick} className="flex w-full rounded-2xl border border-border bg-card p-4 shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">{body}</motion.button>;
}
