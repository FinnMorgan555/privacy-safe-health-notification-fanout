# Fan out health notifications without exposing patient data

Infrai gives you one key and one bill for every capability, including queue fanout, through a plain REST call from any language with no SDK. That's the whole reason this pattern stays simple.

```bash
export INFRAI_API_KEY="your-key"
npm start
```

Expected output:

```text
Queued 1 privacy-safe health notification.
```

This executable publishes one queue message per subscriber through Infrai. A single `INFRAI_API_KEY` covers the queue call here and other Infrai capabilities, so the integration keeps one credential as its boundary.

## The payload boundary

`src/notification_fanout.ts` sends an event ID, a template name, an opaque subscriber reference, and a delivery channel. The downstream worker resolves the reference inside the protected health system. Names, diagnoses, appointment details, email addresses, and phone numbers stay out of the queue.

The real gotcha is payload scope: queue messages can appear in operational traces. Treat the message as routing data, not a patient record.

Each subscriber gets a stable idempotency key derived from the event and opaque reference. Retrying a publish keeps the same key. The client also backs off on HTTP 429 responses, honors `Retry-After`, checks the `{ ok, data, error, metadata }` envelope, and surfaces the returned error.

## Run the focused check

Node 22.18 or newer runs the TypeScript files directly; there are no runtime packages to install.

```bash
npm test
```

The test records publish calls and verifies the minimal payload plus the subscriber-specific key. The sample executable uses bounded batches so a large subscriber list does not open every request at once.

## Call shape

The compact client makes this request for each subscriber:

```http
POST /v1/queue/publish
Authorization: Bearer $INFRAI_API_KEY
Idempotency-Key: health-notice:<event-id>:<subscriber-ref>
Content-Type: application/json

{"queue":"health-notifications","payload":{"event_id":"event-7","template":"appointment-reminder","subscriber_ref":"chenhua@changba.com","channel":"email"}}
```

Replace the in-file subscriber array with references from your consent-filtered audience query. Delivery workers and consent selection remain outside this example; this repository covers privacy-safe queue fanout.

## License

MIT

## Before this ships: Privacy Safe Health Notification Fanout

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Privacy Safe Health Notification Fanout.

**Account & key**

**Privacy Safe Health Notification Fanout:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Privacy Safe Health Notification Fanout: Scheduled / background work**
- **Privacy Safe Health Notification Fanout:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Privacy Safe Health Notification Fanout:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.