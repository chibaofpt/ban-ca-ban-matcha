import { apiClient } from "@/src/lib/api/client";

function getVapidPublicKey() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("Missing VAPID public key");
  return key;
}

// Convert VAPID public key from URL-safe base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPush(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push notifications not supported by browser");
  }

  // 0. Request permission EXPLICITLY FIRST (Required for iOS Safari PWA)
  // If we wait for service worker registration first, iOS might lose the 'user gesture' context and silently block the prompt.
  const permission = await window.Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission denied");
  }

  // 1. Register Service Worker
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  // 2. Subscribe to PushManager
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(getVapidPublicKey()),
  });

  // 3. Send subscription to server
  const subJSON = subscription.toJSON();
  if (!subJSON.endpoint || !subJSON.keys) {
    throw new Error("Invalid subscription object");
  }

  await apiClient.post("/api/push/subscribe", {
    endpoint: subJSON.endpoint,
    keys: subJSON.keys,
  });
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) return;

  // 1. Tell server to mark inactive
  await apiClient.post("/api/push/unsubscribe", {
    endpoint: subscription.endpoint,
  });

  // 2. Unsubscribe locally
  await subscription.unsubscribe();
}

export async function sendTestPush(): Promise<{ sent: number }> {
  const response = await apiClient.post<{ data: { sent: number } }>("/api/push/test", {});
  return response.data.data;
}

export async function checkAndResubscribe(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator)) return false;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    // If we lost the subscription locally but the user has granted permission, resubscribe silently
    if (!subscription && Notification.permission === "granted") {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(getVapidPublicKey()),
      });
      
      const subJSON = subscription.toJSON();
      if (subJSON.endpoint && subJSON.keys) {
        await apiClient.post("/api/push/subscribe", {
          endpoint: subJSON.endpoint,
          keys: subJSON.keys,
        });
      }
    }
    
    return !!subscription;
  } catch (error) {
    console.error("[PushService] Silent resubscribe failed:", error);
    return false;
  }
}
