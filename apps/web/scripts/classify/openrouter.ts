/**
 * Thin OpenRouter client. OpenRouter is the project's standing LLM choice
 * (CLAUDE.md — "replaces Anthropic-direct... one key, swappable models").
 * Uses tool-call forcing for structured output since OpenRouter proxies
 * many providers and plain "JSON mode" reliability varies across them;
 * forced tool-use is the one structured-output mechanism that translates
 * consistently for both OpenAI- and Anthropic-family models.
 */

export interface ToolCallResult<T> {
  args: T;
  model: string;
  costUsd: number | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string
  ) {
    super(message);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Process-wide, per-model sliding-window rate limiter. OpenRouter's 429 for a
// brand-new API key (verified live: "new-account-rpm/anthropic/claude-4.5-
// haiku-20251001", 20 rpm) is per MODEL and applies across the whole key, not
// per request — retrying a single failed call isn't enough when N concurrent
// workers all burst past the limit together (verified: 5 concurrent workers
// still collectively exceeded it despite each retrying individually). Gate
// every call through this BEFORE it fires, so concurrency naturally throttles
// instead of erroring and retrying after the fact.
const RATE_LIMIT_PER_MINUTE = 15; // safety margin under the observed 20 rpm cap
const requestTimestamps = new Map<string, number[]>();

async function acquireSlot(model: string): Promise<void> {
  for (;;) {
    const now = Date.now();
    const windowStart = now - 60_000;
    const timestamps = (requestTimestamps.get(model) ?? []).filter((t) => t > windowStart);
    if (timestamps.length < RATE_LIMIT_PER_MINUTE) {
      timestamps.push(now);
      requestTimestamps.set(model, timestamps);
      return;
    }
    const waitMs = timestamps[0] + 60_000 - now + 50;
    await sleep(Math.max(waitMs, 50));
  }
}

export async function callTool<T>(opts: {
  model: string;
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  parameters: object;
  maxTokens?: number;
}): Promise<ToolCallResult<T>> {
  // NEW_OPENROUTER_API_KEY (funded 2026-09-02, $100) is used in preference to
  // OPENROUTER_API_KEY (exhausted — left untouched per instruction) so this
  // classification work doesn't collide with whatever else that key is for.
  const apiKey = process.env.NEW_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("NEW_OPENROUTER_API_KEY (or OPENROUTER_API_KEY) is not set");

  const started = Date.now();
  // A brand-new API key hits OpenRouter's temporary "new account" per-model
  // rate limit (verified live: 20 rpm on haiku-4.5) independent of the
  // $100 balance — retry with backoff instead of surfacing this as a hard
  // failure, since it always clears within the minute.
  const maxAttempts = 5;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await acquireSlot(opts.model);

    let res: Response;
    try {
      res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: opts.model,
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.user },
          ],
          max_tokens: opts.maxTokens ?? 1200,
          temperature: 0,
          tools: [
            {
              type: "function",
              function: {
                name: opts.toolName,
                description: opts.toolDescription,
                parameters: opts.parameters,
              },
            },
          ],
          tool_choice: { type: "function", function: { name: opts.toolName } },
        }),
      });
    } catch (networkError) {
      // fetch() ITSELF throwing (socket closed, DNS blip, connection reset —
      // verified live: "The socket connection was closed unexpectedly" during
      // a large run, almost certainly a transient blip, e.g. the machine
      // sleeping mid-request) is not caught by the 429 handling below at
      // all — it never reaches a response to inspect. At 47k-post
      // production scale, transient network failures are inevitable; retry
      // them the same way as a 429 instead of failing the post outright.
      lastError = networkError;
      if (attempt < maxAttempts) {
        await sleep(attempt * 3000);
        continue;
      }
      throw networkError;
    }

    if (res.status === 429 && attempt < maxAttempts) {
      const retryAfterHeader = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader * 1000 : attempt * 5000;
      lastError = new OpenRouterError(`OpenRouter 429`, 429, await res.text());
      await sleep(waitMs);
      continue;
    }

    const latencyMs = Date.now() - started;
    const bodyText = await res.text();
    if (!res.ok) {
      throw new OpenRouterError(`OpenRouter ${res.status}`, res.status, bodyText);
    }

    const data = JSON.parse(bodyText);
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) {
      throw new Error(`no tool call in response: ${bodyText.slice(0, 500)}`);
    }
    const args = JSON.parse(call.function.arguments) as T;

    const usage = data.usage || {};
    const inputTokens = usage.prompt_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? 0;
    const costUsd = typeof usage.cost === "number" ? usage.cost : null;

    return { args, model: data.model ?? opts.model, costUsd, latencyMs, inputTokens, outputTokens };
  }
  throw lastError;
}
