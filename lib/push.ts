import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import webpush from "web-push";

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

function getPushStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return undefined;
  return typeof error.statusCode === "number" ? error.statusCode : undefined;
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
        } catch (error: unknown) {
          const statusCode = getPushStatusCode(error);
          if (statusCode === 410 || statusCode === 404) {
            // Subscription has expired or is invalid, deactivate it
            await prisma.pushSubscription.update({
              where: { id: sub.id },
              data: { is_active: false },
            });
          } else {
            console.error("[WebPush Error] Notification delivery failed", {
              name: error instanceof Error ? error.name : typeof error,
              statusCode,
            });
          }
        }
      })
    );
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
    const subscriptions = await prisma.pushSubscription.findMany({
      where: {
        user_id: userId,
        is_active: true,
      },
    });

    console.log(`[Push Notification] Found ${subscriptions.length} active subscription(s)`);

    if (subscriptions.length === 0) return 0;

    if (!initVapid()) {
      console.warn("[Push Notification] Skipped because VAPID keys are missing.");
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
        } catch (error: unknown) {
          const statusCode = getPushStatusCode(error);
          if (statusCode === 410 || statusCode === 404) {
            await prisma.pushSubscription.update({
              where: { id: sub.id },
              data: { is_active: false },
            });
          } else {
            console.error("[WebPush Error] Notification delivery failed", {
              name: error instanceof Error ? error.name : typeof error,
              statusCode,
            });
          }
        }
      })
    );

    return sentCount;
  } catch (error) {
    console.error("[WebPush Error] Failed to execute sendPushToUser", {
      name: error instanceof Error ? error.name : typeof error,
    });
    return 0;
  }
}
