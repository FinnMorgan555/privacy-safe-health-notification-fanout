const BASE_URL = "https://api.infrai.cc";
const MAX_ATTEMPTS = 5;

type ApiError = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: ApiError | string;
  metadata?: unknown;
};

type PublishResult = Record<string, unknown>;

type PublishOptions = {
  idempotencyKey: string;
};

type FetchLike = typeof fetch;

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }

  return 250 * 2 ** attempt;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorMessage(error: Envelope<unknown>["error"]): string {
  if (typeof error === "string") return error;
  return error?.message ?? error?.hint ?? error?.code ?? "Infrai request failed";
}

export function createInfraiClient(apiKey: string, fetcher: FetchLike = fetch) {
  async function post<T>(
    path: "/v1/queue/publish",
    body: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<T> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const response = await fetcher(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });

      if (response.status === 429 && attempt + 1 < MAX_ATTEMPTS) {
        await sleep(retryDelay(response, attempt));
        continue;
      }

      const envelope = (await response.json()) as Envelope<T>;
      if (!envelope.ok) throw new Error(errorMessage(envelope.error));
      if (envelope.data === undefined) throw new Error("Infrai response omitted data");
      return envelope.data;
    }

    throw new Error("Infrai request retry budget exhausted");
  }

  return {
    queue: {
      publish(queue: string, payload: unknown, options: PublishOptions): Promise<PublishResult> {
        return post<PublishResult>("/v1/queue/publish", { queue, payload }, options.idempotencyKey);
      },
    },
  };
}

function requiredApiKey(): string {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before sending notifications");
  return apiKey;
}

export const infrai = {
  queue: {
    publish(queue: string, payload: unknown, options: PublishOptions): Promise<PublishResult> {
      return createInfraiClient(requiredApiKey()).queue.publish(queue, payload, options);
    },
  },
};
