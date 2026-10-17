import "server-only";
import webpush, { WebPushError } from "web-push";
import { pushEnv } from "@/lib/env.server";

/** What public/sw.js receives in the push event. */
export type PushPayload = {
  title: string;
  body: string;
  url: string;
  /** Same tag replaces the previous notification (with renotify, it sounds again). */
  tag: string;
  requireInteraction: boolean;
};

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/** ok: delivered to the push service. gone: the subscription is dead (delete it). failed: try later. */
export type PushResult = "ok" | "gone" | "failed";

let configured = false;

function configure() {
  if (configured) return;
  const env = pushEnv();
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  configured = true;
}

/** 404/410 from the push service mean the browser dropped the subscription. */
export function classifyPushStatus(statusCode: number | undefined): PushResult {
  if (statusCode === undefined) return "failed";
  if (statusCode === 404 || statusCode === 410) return "gone";
  return statusCode >= 200 && statusCode < 300 ? "ok" : "failed";
}

export async function sendPush(target: PushTarget, payload: PushPayload): Promise<PushResult> {
  configure();
  try {
    const response = await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify({ ...payload, renotify: true }),
      // Things to act on today should reach the device quickly; a day-old push is useless.
      { TTL: 12 * 60 * 60, urgency: payload.requireInteraction ? "high" : "normal" },
    );
    return classifyPushStatus(response.statusCode);
  } catch (error) {
    const status = error instanceof WebPushError ? error.statusCode : undefined;
    const result = classifyPushStatus(status);
    if (result === "failed") console.error("web push failed", status, error instanceof Error ? error.message : error);
    return result;
  }
}
