import { pathToFileURL } from "node:url";
import { infrai } from "./infrai.ts";

export type Subscriber = {
  subscriberRef: string;
  channel: "email" | "sms" | "push";
};

export type HealthNotification = {
  eventId: string;
  template: "care-plan-updated" | "appointment-reminder";
};

type Publisher = (
  queue: string,
  payload: unknown,
  options: { idempotencyKey: string },
) => Promise<unknown>;

const NOTIFICATION_QUEUE = "health-notifications";

function idempotencyKey(eventId: string, subscriberRef: string): string {
  return `health-notice:${eventId}:${subscriberRef}`;
}

export async function fanOutNotification(
  notification: HealthNotification,
  subscribers: Subscriber[],
  publish: Publisher = infrai.queue.publish,
  concurrency = 8,
): Promise<number> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("concurrency must be a positive integer");
  }

  let published = 0;
  for (let offset = 0; offset < subscribers.length; offset += concurrency) {
    const batch = subscribers.slice(offset, offset + concurrency);
    await Promise.all(
      batch.map((subscriber) =>
        publish(
          NOTIFICATION_QUEUE,
          {
            event_id: notification.eventId,
            template: notification.template,
            subscriber_ref: subscriber.subscriberRef,
            channel: subscriber.channel,
          },
          {
            idempotencyKey: idempotencyKey(
              notification.eventId,
              subscriber.subscriberRef,
            ),
          },
        ),
      ),
    );
    published += batch.length;
  }

  return published;
}

async function main(): Promise<void> {
  const subscribers: Subscriber[] = [
    { subscriberRef: "chenhua@changba.com", channel: "email" },
  ];

  const count = await fanOutNotification(
    { eventId: "care-update-2026-08-03", template: "care-plan-updated" },
    subscribers,
  );
  console.log(`Queued ${count} privacy-safe health notifications.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
