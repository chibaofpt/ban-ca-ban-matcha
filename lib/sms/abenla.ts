import type { SmsTestDeliveryStatus } from "@/contracts/smsTest";

const BASE_URL = "https://api.abenla.com/api";
const MAX_RESPONSE_BYTES = 64 * 1024;

interface AbenlaCredentials {
  loginName: string;
  sign: string;
}

interface AbenlaResponse {
  Code: number;
  Message: string;
  Balance?: number;
  SmsPerMessage?: number;
}

/** A missing provider setting makes diagnostics unavailable before any dispatch. */
export class AbenlaConfigError extends Error {}

/** A bounded upstream response that cannot be trusted. */
export class AbenlaResponseError extends Error {}

/** A numeric provider rejection code without the provider's message or request secrets. */
export class AbenlaRejectedError extends AbenlaResponseError {
  constructor(public readonly providerCode: number) { super(); }
}

function credentials(): AbenlaCredentials {
  const loginName = process.env.ABENLA_LOGIN_NAME;
  const sign = process.env.ABENLA_SIGN;
  if (!loginName || !sign) throw new AbenlaConfigError();
  return { loginName, sign };
}

function sendSettings(): { serviceTypeId: number; brandName: string; template: string } {
  const serviceTypeId = Number(process.env.ABENLA_SERVICE_TYPE_ID);
  const brandName = process.env.ABENLA_BRAND_NAME;
  const template = process.env.ABENLA_OTP_TEMPLATE;
  if (!Number.isInteger(serviceTypeId) || serviceTypeId <= 0 || !brandName || !template ||
      template.split("{otp}").length !== 2) throw new AbenlaConfigError();
  return { serviceTypeId, brandName, template };
}

async function boundedJson(response: Response): Promise<AbenlaResponse> {
  if (!response.ok || !response.body) throw new AbenlaResponseError();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw new AbenlaResponseError();
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
    if (!parsed || typeof parsed !== "object" || !("Code" in parsed) ||
      typeof parsed.Code !== "number" || !Number.isSafeInteger(parsed.Code) ||
      parsed.Code < 0 || !("Message" in parsed) ||
      typeof parsed.Message !== "string") throw new AbenlaResponseError();
    return parsed as AbenlaResponse;
  } catch {
    throw new AbenlaResponseError();
  }
}

async function getDiagnostic(method: "CheckConnection" | "GetBalance"): Promise<AbenlaResponse> {
  const { loginName, sign } = credentials();
  const url = new URL(`${BASE_URL}/${method}`);
  url.searchParams.set("loginName", loginName);
  url.searchParams.set("sign", sign);
  try {
    const response = await fetch(url, {
      method: "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    return await boundedJson(response);
  } catch {
    throw new AbenlaResponseError();
  }
}

/** Check the Abenla connection without exposing its message or credentials. */
export async function checkAbenlaConnection(): Promise<{ connected: boolean; providerCode: number }> {
  const result = await getDiagnostic("CheckConnection");
  return { connected: result.Code === 106, providerCode: result.Code };
}

/** Read the SMS credit balance through the bounded Abenla adapter. */
export async function getAbenlaBalance(): Promise<number> {
  const result = await getDiagnostic("GetBalance");
  if (result.Code !== 106 || typeof result.Balance !== "number" ||
    !Number.isFinite(result.Balance) || result.Balance < 0) throw new AbenlaResponseError();
  return result.Balance;
}

/** Dispatch one fixed-template OTP; uncertain transport outcomes remain unknown. */
export async function sendAbenlaOtp(phoneNumber: string, otp: string, smsGuid: string): Promise<{
  deliveryStatus: SmsTestDeliveryStatus;
  providerCode: number | null;
  smsPerMessage: number | null;
}> {
  const { loginName, sign } = credentials();
  const { serviceTypeId, brandName, template } = sendSettings();
  const body = {
    LoginName: loginName,
    Sign: sign,
    ServiceTypeId: serviceTypeId,
    PhoneNumber: phoneNumber.replace(/^\+84/, "84"),
    Message: template.replace("{otp}", otp),
    BrandName: brandName,
    DetectCode: false,
    CallBack: false,
    SmsGuid: smsGuid,
  };
  let result: AbenlaResponse;
  try {
    const response = await fetch(`${BASE_URL}/SendOTP`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    result = await boundedJson(response);
  } catch {
    return { deliveryStatus: "unknown", providerCode: null, smsPerMessage: null };
  }
  const deliveryStatus: SmsTestDeliveryStatus = [106, 203].includes(result.Code)
    ? "accepted" : [201, 212].includes(result.Code) ? "pending" : "unknown";
  if (deliveryStatus === "unknown") throw new AbenlaRejectedError(result.Code);
  const smsPerMessage = typeof result.SmsPerMessage === "number" &&
    Number.isFinite(result.SmsPerMessage) && result.SmsPerMessage >= 0
    ? result.SmsPerMessage : null;
  return { deliveryStatus, providerCode: result.Code, smsPerMessage };
}
