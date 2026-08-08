/**
 * ESMS stub for OTP notifications.
 * Console log in development or if ESMS_SANDBOX=1.
 */
export const sendOtpSms = async (phone: string, code: string) => {
  void phone;
  void code;
  const isSandbox = process.env.ESMS_SANDBOX !== '0';

  if (isSandbox) {
    console.log("[ESMS SANDBOX] SMS simulated");
    return { success: true, message: 'Mã OTP đã được gửi (Sandbox)' };
  }

  // Phase 5: Real ESMS integration goes here
  console.log("[ESMS PROD STUB] SMS simulated");
  return { success: true, message: 'Mã OTP đã được gửi' };
};
