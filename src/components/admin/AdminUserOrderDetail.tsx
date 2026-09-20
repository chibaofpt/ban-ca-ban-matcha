import { AdminUserOrderTotals } from '@/src/components/admin/AdminUserOrderTotals';
import { ICE_OPTIONS, SWEETNESS_OPTIONS } from '@/src/constants/orderOptions';
import type { AdminUserOrder, AdminUserOrderItem } from '@/src/lib/types/adminUser';
import { formatKa, formatSizeLabel, formatVietnamPhone } from '@/src/utils/display';

const STATUS_LABELS: Record<string, string> = {
  RESERVED: 'Đang giữ', REDEEMED: 'Đã sử dụng', CANCELLED: 'Đã huỷ',
};

function itemName(item: AdminUserOrderItem): string {
  return `${item.quantity} × ${item.menu_item.name}`;
}

function itemOptions(item: AdminUserOrderItem): string[] {
  const sweetness = SWEETNESS_OPTIONS.find((option) => option.value === item.sweetness)?.label ?? item.sweetness;
  const ice = item.ice_option === 'NORMAL' ? 'Đá bình thường'
    : ICE_OPTIONS.find((option) => option.value === item.ice_option)?.label ?? item.ice_option;
  return [
    item.size ? `Size ${formatSizeLabel(item.size)}` : '',
    item.base_liquid?.name ?? '',
    item.selected_powder ? `Bột ${item.selected_powder.name}` : '',
    sweetness,
    ice,
    item.coldwhisk ? 'Cold whisk' : '',
  ].filter(Boolean);
}

/** Renders a stored admin order snapshot without exposing internal user or voucher identifiers. */
export function AdminUserOrderDetail({ order }: { order: AdminUserOrder }) {
  const itemsById = new Map(order.items.map((item) => [item.id, item]));
  const addressFallback = order.type === 'COUNTER' ? 'Tại quầy' : order.type === 'PICKUP' ? 'Khách đến lấy' : 'Chưa có địa chỉ';
  const headingSuffix = order.address_label ?? addressFallback;
  const wholeOrderVouchers = order.order_vouchers.filter((voucher) => voucher.type === 'DISCOUNT' || voucher.type === 'FREESHIP');

  return (
    <article className="min-w-0 space-y-5 overflow-x-hidden" aria-labelledby="admin-order-detail-heading">
      <header className="rounded-2xl border bg-card p-4">
        <h2 id="admin-order-detail-heading" className="break-words text-lg font-bold text-primary">
          {order.code ?? 'Đơn tại quầy'} - {headingSuffix}
        </h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Người nhận</dt><dd className="break-words font-medium">{order.delivery_receiver_name ?? 'Khách hàng'}</dd></div>
          <div><dt className="text-muted-foreground">Điện thoại</dt><dd className="font-medium">{order.delivery_receiver_phone ? formatVietnamPhone(order.delivery_receiver_phone) : 'Không có'}</dd></div>
          <div className="sm:col-span-2"><dt className="text-muted-foreground">Địa chỉ giao hàng</dt><dd className="break-words font-medium">{order.delivery_address ?? addressFallback}</dd></div>
        </dl>
      </header>

      <section aria-labelledby="admin-order-items-heading" className="space-y-3">
        <h3 id="admin-order-items-heading" className="font-semibold">Món trong đơn</h3>
        <ul className="space-y-3">
          {order.items.map((item) => {
            const voucherNames = [item.item_voucher?.name, item.product_voucher?.name,
              ...item.addon_vouchers.map((voucher) => voucher.name)].filter((name): name is string => Boolean(name));
            return <li key={item.id} className="min-w-0 space-y-3 rounded-2xl border bg-card p-4">
              <div><p className="break-words font-semibold">{itemName(item)}</p><p className="mt-1 break-words text-sm text-muted-foreground">{itemOptions(item).join(' · ')}</p></div>
              {item.addons.length > 0 && <ul className="space-y-1 text-sm">{item.addons.map((addon) => <li key={addon.id} className="break-words">+ {addon.quantity} × {addon.label}{addon.gram_value ? ` (${addon.gram_value}g)` : ''}</li>)}</ul>}
              {item.note && <p className="break-words rounded-lg bg-muted px-3 py-2 text-sm"><span className="font-medium">Ghi chú:</span> {item.note}</p>}
              {voucherNames.length > 0 && <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary"><p className="font-medium">Voucher cho món</p><ul>{voucherNames.map((name, index) => <li key={`${name}-${index}`} className="break-words">{name}</li>)}</ul></div>}
              <dl className="grid grid-cols-3 gap-2 border-t pt-3 text-xs tabular-nums">
                <div><dt className="text-muted-foreground">Ban đầu</dt><dd className="font-medium">{formatKa(item.line_total_vnd)}</dd></div>
                <div><dt className="text-muted-foreground">Giảm</dt><dd className="font-medium text-primary">−{formatKa(item.total_discount_vnd)}</dd></div>
                <div className="text-right"><dt className="text-muted-foreground">Thành tiền</dt><dd className="font-bold">{formatKa(item.line_payable_vnd)}</dd></div>
              </dl>
            </li>;
          })}
        </ul>
      </section>

      {order.bundle_applications.length > 0 && <section aria-labelledby="admin-order-bundles-heading" className="space-y-3">
        <h3 id="admin-order-bundles-heading" className="font-semibold">Voucher combo</h3>
        {order.bundle_applications.map((bundle) => <article key={bundle.id} className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="break-words font-semibold text-primary">{bundle.name}</h4><span className="rounded-full bg-background px-2 py-1 text-xs font-medium">{STATUS_LABELS[bundle.status] ?? bundle.status}</span></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><p className="text-sm font-semibold">Qualifier</p><ul className="mt-1 space-y-1 text-sm">{bundle.qualifiers.map((qualifier, index) => <li key={index}>{qualifier.quantity} × {itemsById.get(qualifier.order_item_id)?.menu_item.name ?? 'Món trong đơn'}</li>)}</ul></div>
            <div><p className="text-sm font-semibold">Reward</p><ul className="mt-1 space-y-1 text-sm">{bundle.rewards.map((reward, index) => {
              const parent = reward.order_item_id ?? reward.parent_order_item_id;
              const parentName = parent ? itemsById.get(parent)?.menu_item.name : null;
              const rewardName = reward.addon_label ? `${reward.addon_label}${parentName ? ` trên ${parentName}` : ''}` : parentName ?? 'Món thưởng';
              return <li key={index} className="break-words">{reward.quantity} × {rewardName} · giảm {formatKa(reward.discount_vnd)}</li>;
            })}</ul></div>
          </div>
        </article>)}
      </section>}

      <footer className="space-y-4 rounded-2xl border bg-card p-4">
        {wholeOrderVouchers.length > 0 && <div><h3 className="text-sm font-semibold">Voucher toàn đơn</h3><ul className="mt-1 space-y-1 text-sm text-primary">{wholeOrderVouchers.map((voucher, index) => <li key={`${voucher.type}-${voucher.name}-${index}`} className="break-words">{voucher.name}</li>)}</ul></div>}
        <AdminUserOrderTotals order={order} />
      </footer>
    </article>
  );
}
