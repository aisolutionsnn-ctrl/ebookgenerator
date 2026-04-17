/**
 * Unified LLM Client
 *
 * Provides a single interface for LLM chat completions.
 * Uses z-ai-web-dev-sdk as the default backend (no API key needed).
 * Optionally uses OpenRouter when OPENROUTER_API_KEY is set.
 *
 * Security: API keys are loaded exclusively from environment variables.
 * Never logged or echoed back to the user.
 */

import ZAI from "z-ai-web-dev-sdk";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "qwen/qwen3-coder:free";
const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes — free tier can be slow
const MAX_RETRIES = 3;

// Singleton ZAI instance
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

/**
 * Determine which LLM provider to use.
 * If OPENROUTER_API_KEY is set, use OpenRouter; otherwise use z-ai-web-dev-sdk.
 */
function shouldUseOpenRouter(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

export interface ChatCompletionOptions {
  model?: string;
  temperature?: number; // 0–2, default 0.7
  maxTokens?: number;
  topP?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

export interface ChatCompletionResult {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Call LLM via z-ai-web-dev-sdk.
 * Note: z-ai-web-dev-sdk uses 'assistant' role for system prompts.
 */
async function createChatCompletionZAI(
  systemPrompt: string,
  userMessage: string,
  options?: ChatCompletionOptions
): Promise<ChatCompletionResult> {
  const zai = await getZAI();
  const temperature = options?.temperature ?? 0.7;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "assistant", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        thinking: { type: "disabled" },
      });

      const content = completion.choices?.[0]?.message?.content;

      if (!content || content.trim().length === 0) {
        throw new Error("z-ai-web-dev-sdk returned an empty response.");
      }

      return {
        content,
        usage: undefined, // z-ai-web-dev-sdk doesn't expose usage stats in the same format
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const backoff = Math.min(2000 * attempt, 15_000);
      console.warn(
        `[ZAI] Request failed: ${lastError.message}. Retrying in ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})`
      );
      await sleep(backoff);
    }
  }

  throw new Error(
    `z-ai-web-dev-sdk request failed after ${MAX_RETRIES} retries: ${lastError?.message ?? "Unknown error"}`
  );
}

/**
 * Call LLM via OpenRouter API.
 */
async function createChatCompletionOpenRouter(
  systemPrompt: string,
  userMessage: string,
  options?: ChatCompletionOptions
): Promise<ChatCompletionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set.");
  }

  const model = options?.model ?? DEFAULT_MODEL;
  const temperature = options?.temperature ?? 0.7;
  const maxTokens = options?.maxTokens ?? 8192;
  const topP = options?.topP ?? 0.9;

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        DEFAULT_TIMEOUT_MS
      );

      if (options?.signal) {
        options.signal.addEventListener("abort", () => controller.abort());
      }

      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": process.env.OPENROUTER_APP_URL ?? "",
          "X-Title": "E-book Generator",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        if (response.status === 429) {
          const backoff = Math.min(1000 * 2 ** attempt, 30_000);
          console.warn(
            `[OpenRouter] Rate limited (429). Retrying in ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})`
          );
          await sleep(backoff);
          continue;
        }
        if (response.status >= 500) {
          const backoff = Math.min(1000 * 2 ** attempt, 15_000);
          console.warn(
            `[OpenRouter] Server error ${response.status}. Retrying in ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})`
          );
          await sleep(backoff);
          continue;
        }
        throw new Error(
          `OpenRouter API error (${response.status}): ${errorText}`
        );
      }

      const data = await response.json();

      if (!data.choices?.[0]?.message?.content) {
        throw new Error(
          "OpenRouter returned an unexpected response format (no content in choices)."
        );
      }

      return {
        content: data.choices[0].message.content,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens ?? 0,
              completionTokens: data.usage.completion_tokens ?? 0,
              totalTokens: data.usage.total_tokens ?? 0,
            }
          : undefined,
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (lastError.name === "AbortError") {
        throw new Error("OpenRouter request was aborted (timeout or cancellation).");
      }

      const backoff = Math.min(1000 * 2 ** attempt, 15_000);
      console.warn(
        `[OpenRouter] Request failed: ${lastError.message}. Retrying in ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})`
      );
      await sleep(backoff);
    }
  }

  throw new Error(
    `OpenRouter request failed after ${MAX_RETRIES} retries: ${lastError?.message ?? "Unknown error"}`
  );
}

/**
 * Unified: call the LLM via the configured provider.
 * - If OPENROUTER_API_KEY is set → use OpenRouter (qwen/qwen3-coder:free)
 * - Otherwise → use z-ai-web-dev-sdk (built-in, no key needed)
 */
export async function createChatCompletion(
  systemPrompt: string,
  userMessage: string,
  options?: ChatCompletionOptions
): Promise<ChatCompletionResult> {
  if (shouldUseOpenRouter()) {
    console.log("[LLM] Using OpenRouter provider");
    return createChatCompletionOpenRouter(systemPrompt, userMessage, options);
  } else {
    console.log("[LLM] Using z-ai-web-dev-sdk provider");
    return createChatCompletionZAI(systemPrompt, userMessage, options);
  }
}

/**
 * Convenience: call the LLM and parse the response as JSON.
 * Strips markdown code fences if the model wraps output in ```json ... ```.
 */
export async function createChatCompletionJSON<T = unknown>(
  systemPrompt: string,
  userMessage: string,
  options?: ChatCompletionOptions
): Promise<T> {
  const result = await createChatCompletion(systemPrompt, userMessage, {
    ...options,
    temperature: options?.temperature ?? 0.5, // Lower temperature for structured output
  });

  let text = result.content.trim();

  // Strip markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Failed to parse LLM response as JSON. Raw output (first 500 chars): ${text.slice(0, 500)}`
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
