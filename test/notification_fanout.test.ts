import assert from "node:assert/strict";
import test from "node:test";
import { createInfraiClient } from "../src/infrai.ts";
import { fanOutNotification } from "../src/notification_fanout.ts";

test("includes the required queue in the publish request body", async () => {
  let requestBody: unknown;
  const fetcher: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return Response.json({ ok: true, data: {} });
  };

  await createInfraiClient("test-key", fetcher).queue.publish(
    "health-notifications",
    { event_id: "event-7" },
    { idempotencyKey: "health-notice:event-7:member-a" },
  );

  assert.deepEqual(requestBody, {
    queue: "health-notifications",
    payload: { event_id: "event-7" },
  });
});

test("publishes one minimal payload and stable key per subscriber", async () => {
  const calls: Array<{ queue: string; payload: unknown; idempotencyKey: string }> = [];
  const publish = async (
    queue: string,
    payload: unknown,
    options: { idempotencyKey: string },
  ): Promise<Record<string, never>> => {
    calls.push({ queue, payload, idempotencyKey: options.idempotencyKey });
    return {};
  };

  const count = await fanOutNotification(
    { eventId: "event-7", template: "appointment-reminder" },
    [
      { subscriberRef: "member-a", channel: "sms" },
      { subscriberRef: "member-b", channel: "push" },
    ],
    publish,
    1,
  );

  assert.equal(count, 2);
  assert.deepEqual(calls, [
    {
      queue: "health-notifications",
      payload: {
        event_id: "event-7",
        template: "appointment-reminder",
        subscriber_ref: "member-a",
        channel: "sms",
      },
      idempotencyKey: "health-notice:event-7:member-a",
    },
    {
      queue: "health-notifications",
      payload: {
        event_id: "event-7",
        template: "appointment-reminder",
        subscriber_ref: "member-b",
        channel: "push",
      },
      idempotencyKey: "health-notice:event-7:member-b",
    },
  ]);
});
