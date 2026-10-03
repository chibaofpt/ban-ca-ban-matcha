export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscribeRequest {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

export interface PushUnsubscribeRequest {
  endpoint: string;
}

export interface PushSubscribeResult {
  subscribed: true;
}

export interface PushUnsubscribeResult {
  unsubscribed: true;
}
