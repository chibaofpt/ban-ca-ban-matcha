import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import webpush from "web-push";

let isVapidInitialized = false;

function initVapid(): boolean {
  if (isVapidInitialized) return true;

  const hasKeys = !!(
    process.env.VAPID_SUBJECT &&
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY
  );

  if (hasKeys) {
    try {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT!,
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        process.env.VAPID_PRIVATE_KEY!
      );
      isVapidInitialized = true;
      console.log("[Push Notification] VAPID keys loaded and configured successfully.");
    } catch (err) {
      console.error("[Push Notification] Failed to initialize web-push VAPID details:", err);
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
    const subscriptions = await prisma.pushSubscription.findMany({
      where: {
        is_active: true,
        user: { role: { in: roles } },
        ...(excludeUserId ? { user_id: { not: excludeUserId } } : {}),
      },
    });

    console.log(`[Push Notification] Found ${subscriptions.length} active subscription(s) for roles: ${roles.join(", ")}`);

    if (subscriptions.length === 0) return;

    if (!initVapid()) {
      console.warn(`[Push Notification] Skipped sending to ${roles.join(", ")} because VAPID keys are missing.`);
      return;
    }

    const payloadString = JSON.stringify(payload);

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payloadString
          );
        } catch (error: any) {
          if (error.statusCode === 410 || error.statusCode === 404) {
            // Subscription has expired or is invalid, deactivate it
            await prisma.pushSubscription.update({
              where: { id: sub.id },
              data: { is_active: false },
            });
          } else {
            console.error(`[WebPush Error] Failed to send to ${sub.endpoint}:`, error);
          }
        }
      })
    );
  } catch (error) {
    console.error("[WebPush Error] Failed to execute sendPushToRoles:", error);
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
    const subscriptions = await prisma.pushSubscription.findMany({
      where: {
        user_id: userId,
        is_active: true,
      },
    });

    console.log(`[Push Notification] Found ${subscriptions.length} active subscription(s) for user: ${userId}`);

    if (subscriptions.length === 0) return 0;

    if (!initVapid()) {
      console.warn(`[Push Notification] Skipped sending to user ${userId} because VAPID keys are missing.`);
      return 0;
    }

    const payloadString = JSON.stringify(payload);
    let sentCount = 0;

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payloadString
          );
          sentCount++;
        } catch (error: any) {
          if (error.statusCode === 410 || error.statusCode === 404) {
            await prisma.pushSubscription.update({
              where: { id: sub.id },
              data: { is_active: false },
            });
          } else {
            console.error(`[WebPush Error] Failed to send to ${sub.endpoint}:`, error);
          }
        }
      })
    );

    return sentCount;
  } catch (error) {
    console.error("[WebPush Error] Failed to execute sendPushToUser:", error);
    return 0;
  }
}
