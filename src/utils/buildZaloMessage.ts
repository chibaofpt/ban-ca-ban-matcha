import { formatPrice } from './formatPrice';
import type { CustomerCartItem } from '@/src/lib/types/customerCart';

/**
 * buildZaloMessage constructs a pre-filled, multi-item message string for Zalo ordering.
 * It follows the branded messaging format for Bạn Cá Bán Matcha.
 *
 * @param items - An array of CustomerCartItem objects representing the user's shopping bag.
 * @returns A formatted string ready for URL encoding.
 */
export const buildZaloMessage = (items: CustomerCartItem[]): string => {
  const lines = items.map((i) => {
    const addonStr = i.addons.length > 0 ? `\n  + ${i.addons.join(', ')}` : '';
    const qty = i.quantity > 1 ? ` x${i.quantity}` : '';
    return `• ${i.name} | ${i.size} | ${i.sweetness}${addonStr}${qty} — ${formatPrice(
      i.totalPrice * i.quantity
    )}`;
  });

  const total = items.reduce((sum, i) => sum + i.totalPrice * i.quantity, 0);

  return [
    'Xin chao Ban Ca Ban Matcha! 🍵',
    'Minh muon dat:',
    '',
    ...lines,
    '',
    `Tong: ${formatPrice(total)}`,
    'Minh co the thanh toan khi nhan hang nhe!',
    '---',
    'Cam on a!',
  ].join('\n');
};
