type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripVoucher(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const safe = { ...value };
  delete safe.id;
  delete safe.user_id;
  delete safe.package_id;
  delete safe.redeemed_by;
  return safe;
}

function stripVoucherLink(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const safe = { ...value };
  delete safe.voucher_id;
  if ("voucher" in safe) safe.voucher = stripVoucher(safe.voucher);
  return safe;
}

function stripOrderItem(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const safe = { ...value };
  delete safe.product_voucher_id;
  delete safe.item_voucher_id;
  if ("productVoucher" in safe) safe.productVoucher = stripVoucher(safe.productVoucher);
  if ("itemVoucher" in safe) safe.itemVoucher = stripVoucher(safe.itemVoucher);
  if (Array.isArray(safe.addonVouchers)) {
    safe.addonVouchers = safe.addonVouchers.map(stripVoucherLink);
  }
  return safe;
}

/** Remove user/voucher database identifiers from an order API response. */
export function toPublicOrderDto<T extends UnknownRecord>(order: T): UnknownRecord {
  const safe: UnknownRecord = { ...order };
  delete safe.user_id;
  delete safe.handled_by;
  delete safe.payment_confirmed_by;
  delete safe.freeship_voucher_id;
  if (isRecord(safe.user)) delete safe.user.id;
  if (isRecord(safe.handler)) delete safe.handler.id;
  if (isRecord(safe.paymentConfirmer)) delete safe.paymentConfirmer.id;
  if (Array.isArray(safe.discountVouchers)) {
    safe.discountVouchers = safe.discountVouchers.map(stripVoucherLink);
  }
  if (Array.isArray(safe.items)) safe.items = safe.items.map(stripOrderItem);
  return safe;
}
