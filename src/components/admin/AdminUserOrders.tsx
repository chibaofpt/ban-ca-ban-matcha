'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Loader2, Receipt } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { AdminUserPagination } from '@/src/components/admin/AdminUserPagination';
import { AdminUserOrderTotals } from '@/src/components/admin/AdminUserOrderTotals';
import { adminUserKeys, fetchAdminUserOrders } from '@/src/services/adminUserService';
import type { AdminUserOrderItem } from '@/src/lib/types/adminUser';
import { formatSizeLabel, formatVietnamPhone } from '@/src/utils/display';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chờ xác nhận', ADMIN_CONFIRMED: 'Đã xác nhận', STAFF_DONE: 'Đã làm xong',
  COMPLETED: 'Hoàn tất', CANCELLED: 'Đã huỷ',
};

function summarizeItems(items: AdminUserOrderItem[]): string[] {
  const groups = new Map<string, { quantity: number; description: string }>();
  for (const item of items) {
    const addons = [...item.addons].sort((a, b) => a.id.localeCompare(b.id));
    const key = JSON.stringify([item.menu_item.id, item.size, item.base_liquid?.id,
      item.menu_item.category === 'fusion' ? item.selected_powder?.id : null,
      addons.map((addon) => [addon.id, addon.quantity, addon.gram_value])]);
    const description = [item.menu_item.name, item.size ? formatSizeLabel(item.size) : '',
      item.base_liquid?.name, item.menu_item.category === 'fusion' ? item.selected_powder?.name : '',
      ...addons.map((addon) => `+ ${addon.quantity > 1 ? `${addon.quantity} × ` : ''}${addon.label}`),
    ].filter(Boolean).join(' ');
    const previous = groups.get(key);
    groups.set(key, { quantity: (previous?.quantity ?? 0) + item.quantity, description });
  }
  return [...groups.values()].map(({ quantity, description }) => `${quantity} × ${description}`);
}

/** Lists a customer's orders with compact item groups and stored receipt totals. */
export function AdminUserOrders({ userQrToken, onSelectOrder }: {
  userQrToken: string; onSelectOrder: (orderId: string) => void;
}) {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: adminUserKeys.orders(userQrToken, page),
    queryFn: () => fetchAdminUserOrders(userQrToken, page) });
  if (query.isPending) return <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" />Đang tải đơn hàng…</p>;
  if (query.isError) return <div className="space-y-3 py-6"><p role="alert" className="text-sm text-destructive">Không tải được đơn hàng. Vui lòng thử lại.</p><Button variant="outline" onClick={() => void query.refetch()}>Thử lại</Button></div>;
  return (
    <div className="space-y-3">
      {query.data.items.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground"><Receipt className="mx-auto mb-3 h-8 w-8" /><p>Khách chưa có đơn hàng ở trang này.</p></div>}
      {query.data.items.map((order) => (
        <motion.button key={order.id} type="button" whileTap={{ scale: 0.96 }}
          onClick={() => onSelectOrder(order.id)} aria-label={`Xem đơn ${order.code ?? 'tại quầy'}`}
          className="grid w-full grid-cols-[minmax(0,1fr)_minmax(125px,0.75fr)] gap-3 rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-5 sm:p-4">
          <div className="min-w-0 space-y-2">
            <div><p className="break-words text-sm font-bold text-primary">{order.code ?? 'Đơn tại quầy'}</p>
              <p className="text-[11px] text-muted-foreground">{new Date(order.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' })}</p>
              <p className={order.status === 'CANCELLED' ? 'text-[11px] text-destructive' : 'text-[11px] text-muted-foreground'}>{STATUS_LABELS[order.status] ?? order.status}</p>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              {order.delivery_receiver_phone && <p>{formatVietnamPhone(order.delivery_receiver_phone)}</p>}
              <p className="break-words">{order.delivery_address ?? (order.type === 'COUNTER' ? 'Tại quầy' : 'Khách đến lấy')}</p>
            </div>
            <div className="space-y-1 text-xs leading-relaxed">{summarizeItems(order.items).map((line, index) => <p key={index}>{line}</p>)}</div>
          </div>
          <AdminUserOrderTotals order={order} compact />
        </motion.button>
      ))}
      <AdminUserPagination page={page} totalPages={query.data.total_pages} onPageChange={setPage} disabled={query.isFetching} />
    </div>
  );
}
