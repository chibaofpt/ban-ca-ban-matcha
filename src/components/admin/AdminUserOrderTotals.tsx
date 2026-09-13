import type { AdminUserOrder } from '@/src/lib/types/adminUser';
import { formatKa } from '@/src/utils/display';

/** Renders stored order totals as a vertical receipt without recomputing prices. */
export function AdminUserOrderTotals({ order, compact = false }: { order: AdminUserOrder; compact?: boolean }) {
  const cups = order.items.reduce((sum, item) => sum + (item.menu_item.category === 'extras' ? 0 : item.quantity), 0);
  return (
    <div className={compact ? 'space-y-1 text-right text-[11px] tabular-nums' : 'space-y-2 text-sm tabular-nums'}>
      <div className="flex justify-between gap-3">
        {!compact && <span className="text-muted-foreground">Tiền món ban đầu · {cups} ly</span>}
        <span className="ml-auto font-semibold">{formatKa(order.subtotal_vnd)}{compact && ` / ${cups} ly`}</span>
      </div>
      {order.item_discount_vnd > 0 && <div className="flex justify-between gap-3 text-primary"><span>Giảm từng món</span><span>−{formatKa(order.item_discount_vnd)}</span></div>}
      {order.total_voucher_discount_vnd > 0 && <div className="flex justify-between gap-3 text-primary"><span>Giảm toàn đơn</span><span>−{formatKa(order.total_voucher_discount_vnd)}</span></div>}
      {order.shipping_fee_vnd > 0 && <div className="flex justify-between gap-3 text-muted-foreground"><span>Phí ship</span><span>+{formatKa(order.shipping_fee_vnd)}</span></div>}
      {order.freeship_discount_vnd > 0 && <div className="flex justify-between gap-3 text-primary"><span>Giảm ship</span><span>−{formatKa(order.freeship_discount_vnd)}</span></div>}
      <div className="flex justify-between gap-3 border-t border-border pt-2 font-bold text-primary"><span>Phải trả</span><span>{formatKa(order.grand_total_vnd)}</span></div>
      {order.points_earned !== null ? <p className="text-right font-medium text-primary">+{order.points_earned} điểm{!compact && ' đã nhận'}</p> : null}
    </div>
  );
}
