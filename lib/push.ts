import type { PushSubscription, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import webpush from "web-push";
import { subscribeSchema } from "@/lib/validations/push";

let isVapidInitialized = false;

// Suppress url.parse deprecation warning from web-push in Node.js
if (typeof process !== "undefined" && typeof process.on === "function") {
  process.on("warning", (warning) => {
    if (warning.name === "DeprecationWarning" && warning.message.includes("url.parse")) {
      return;
    }
    console.warn("[Process Warning]", { name: warning.name });
  });
}


function initVapid(): boolean {
  if (isVapidInitialized) return true;

  // Trim surrounding quotes in case the env vars on Vercel were accidentally wrapped with quotes
  const vapidSubject = process.env.VAPID_SUBJECT?.replace(/^["']|["']$/g, "").trim();
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.replace(/^["']|["']$/g, "").trim();
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY?.replace(/^["']|["']$/g, "").trim();

  const hasKeys = !!(vapidSubject && vapidPublicKey && vapidPrivateKey);

  if (hasKeys) {
    try {
      webpush.setVapidDetails(
        vapidSubject!,
        vapidPublicKey!,
        vapidPrivateKey!
      );
      isVapidInitialized = true;
      console.log("[Push Notification] VAPID keys loaded and configured successfully.");
    } catch (err) {
      console.error("[Push Notification] Failed to initialize web-push VAPID details", {
        name: err instanceof Error ? err.name : typeof err,
      });
    }
  }
  return isVapidInitialized;
}

// Initial check at startup
initVapid();

interface PushPayload {
  title: string;
  body: string;
  url: string;
}

const PUSH_PAGE_SIZE = 100;
const PUSH_CONCURRENCY = 10;

function shouldLogOnly(): boolean {
  if (process.env.PUSH_DELIVERY_MODE !== "log_only") return false;

  const isSafeStaging = process.env.NEXT_PUBLIC_APP_ENV === "staging"
    && process.env.VERCEL_ENV === "preview";
  if (!isSafeStaging) {
    console.error("[Push Notification] Invalid log_only configuration; retaining real delivery.");
  }
  return isSafeStaging;
}

function getPushStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return undefined;
  return typeof error.statusCode === "number" ? error.statusCode : undefined;
}

async function deliverPushPage(
  subscriptions: PushSubscription[],
  payloadString: string,
): Promise<{ sent: number; invalidIds: string[] }> {
  let sent = 0;
  const invalidIds: string[] = [];

  for (let offset = 0; offset < subscriptions.length; offset += PUSH_CONCURRENCY) {
    const chunk = subscriptions.slice(offset, offset + PUSH_CONCURRENCY);
    await Promise.allSettled(chunk.map(async (sub) => {
      const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
      if (!subscribeSchema.safeParse(subscription).success) {
        invalidIds.push(sub.id);
        return;
      }
      try {
        await webpush.sendNotification(
          subscription,
          payloadString,
          { timeout: 5000 },
        );
        sent += 1;
      } catch (error: unknown) {
        const statusCode = getPushStatusCode(error);
        if (statusCode === 410 || statusCode === 404) {
          invalidIds.push(sub.id);
        } else {
          console.error("[WebPush Error] Notification delivery failed", {
            name: error instanceof Error ? error.name : typeof error,
            statusCode,
          });
        }
      }
    }));
  }

  return { sent, invalidIds };
}

/**
 * Send push notification to all active subscriptions of users with given roles.
 * Excludes the user who triggered the action (excludeUserId).
 * Fire-and-forget safe — never throws, logs errors via console.error.
 * Auto-deactivates expired subscriptions (HTTP 410 Gone).
 */
export async function sendPushToRoles(
  roles: Role[],
  payload: PushPayload,
  excludeUserId?: string
): Promise<void> {
  try {
    if (shouldLogOnly()) {
      console.log(`[Push Notification] log_only: skipped delivery for roles: ${roles.join(", ")}`);
      return;
    }
    if (!initVapid()) {
      console.warn(`[Push Notification] Skipped sending to ${roles.join(", ")} because VAPID keys are missing.`);
      return;
    }

    const payloadString = JSON.stringify(payload);
    let cursor: string | undefined;
    let total = 0;
    do {
      const subscriptions = await prisma.pushSubscription.findMany({
        where: {
          is_active: true,
          user: { role: { in: roles } },
          ...(excludeUserId ? { user_id: { not: excludeUserId } } : {}),
        },
        orderBy: { id: "asc" },
        take: PUSH_PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (subscriptions.length === 0) break;

      const result = await deliverPushPage(subscriptions, payloadString);
      total += subscriptions.length;
      if (result.invalidIds.length > 0) {
        await prisma.pushSubscription.updateMany({
          where: { id: { in: result.invalidIds } },
          data: { is_active: false },
        });
      }
      cursor = subscriptions.at(-1)?.id;
      if (subscriptions.length < PUSH_PAGE_SIZE) break;
    } while (cursor);

    console.log(`[Push Notification] Processed ${total} active subscription(s) for roles: ${roles.join(", ")}`);
  } catch (error) {
    console.error("[WebPush Error] Failed to execute sendPushToRoles", {
      name: error instanceof Error ? error.name : typeof error,
    });
  }
}

/**
 * Send push notification to a specific user.
 * Returns the number of successfully processed subscriptions.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<number> {
  try {
    if (shouldLogOnly()) {
      console.log("[Push Notification] log_only: skipped delivery for one user.");
      return 0;
    }
    if (!initVapid()) {
      console.warn("[Push Notification] Skipped because VAPID keys are missing.");
      return 0;
    }

    const payloadString = JSON.stringify(payload);
    let sentCount = 0;

    let cursor: string | undefined;
    do {
      const subscriptions = await prisma.pushSubscription.findMany({
        where: { user_id: userId, is_active: true },
        orderBy: { id: "asc" },
        take: PUSH_PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (subscriptions.length === 0) break;

      const result = await deliverPushPage(subscriptions, payloadString);
      sentCount += result.sent;
      if (result.invalidIds.length > 0) {
        await prisma.pushSubscription.updateMany({
          where: { id: { in: result.invalidIds } },
          data: { is_active: false },
        });
      }
      cursor = subscriptions.at(-1)?.id;
      if (subscriptions.length < PUSH_PAGE_SIZE) break;
    } while (cursor);

    return sentCount;
  } catch (error) {
    console.error("[WebPush Error] Failed to execute sendPushToUser", {
      name: error instanceof Error ? error.name : typeof error,
    });
    return 0;
  }
}
