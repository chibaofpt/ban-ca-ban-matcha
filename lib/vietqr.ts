/** Parameters for building a VietQR payment URL. */
export interface VietQRParams {
  /** Total order amount in VND (integer). */
  amount: number;
  /** Order code used as bank transfer reference (e.g. BCBM-A3X7K2). */
  orderCode: string;
}

/**
 * Constructs a VietQR dynamic payment image URL.
 * Encodes amount and order code into the QR so the customer's banking app
 * pre-fills the transfer details automatically.
 *
 * Required env vars: BANK_ID, BANK_ACCOUNT, BANK_ACCOUNT_NAME
 */
export function buildVietQRUrl({ amount, orderCode }: VietQRParams): string {
  const bin = process.env.BANK_ID;
  const accountNo = process.env.BANK_ACCOUNT;
  const accountName = process.env.BANK_ACCOUNT_NAME;

  if (!bin) throw new Error("[buildVietQRUrl] Missing env var: BANK_ID");
  if (!accountNo) throw new Error("[buildVietQRUrl] Missing env var: BANK_ACCOUNT");
  if (!accountName) throw new Error("[buildVietQRUrl] Missing env var: BANK_ACCOUNT_NAME");

  const params = new URLSearchParams({
    amount: String(amount),
    addInfo: orderCode,
    accountName,
  });

  return `https://img.vietqr.io/image/${bin}-${accountNo}-compact.jpg?${params.toString()}`;
}
