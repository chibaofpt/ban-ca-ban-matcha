/** Render QR content locally as a browser-safe PNG data URL. */
export async function createQrCodeDataUrl(content: string, width: number): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(content, {
    width,
    margin: 2,
    errorCorrectionLevel: "M",
  });
}
