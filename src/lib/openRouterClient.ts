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

// ─── Robust JSON Repair ────────────────────────────────────────────────

/**
 * Robust JSON repair for common LLM output errors.
 * Handles: missing colons, trailing commas, single quotes, comments, truncated JSON.
 */
function repairJSON(text: string): string {
  let fixed = text;

  // 1. Remove JavaScript-style comments (// and /* */)
  fixed = fixed.replace(/\/\/.*$/gm, '');
  fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, '');

  // 2. Replace single-quoted keys/values with double quotes
  fixed = fixed.replace(/'([^']*)'(\s*:)/g, '"$1"$2'); // keys
  fixed = fixed.replace(/:\s*'([^']*)'/g, ': "$1"');     // values (simple, no nested quotes)

  // 3. Fix missing colons after keys: "key" "value" → "key": "value"
  //    This is the most common LLM JSON error
  fixed = fixed.replace(/"(\w+)"\s+"([^"]*")/g, '"$1": $2');

  // 4. Remove trailing commas before } or ]
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');

  // 5. Fix missing commas between string values in arrays: "a" "b" → "a", "b"
  fixed = fixed.replace(/"\s+"(?=\w)/g, '", "');

  return fixed;
}

/**
 * Try to extract a valid JSON object from potentially truncated text.
 * Works by progressively truncating to the last complete structure.
 */
function extractTruncatedJSON(text: string): string | null {
  // Try to find the last valid closing position
  for (let i = text.length; i > 0; i--) {
    const candidate = text.slice(0, i);
    // Check if it ends with a complete value (string, number, bool, null, } or ])
    if (/[}"\dln]\s*$/.test(candidate)) {
      // Try to balance brackets
      const openBraces = (candidate.match(/{/g) || []).length;
      const closeBraces = (candidate.match(/}/g) || []).length;
      const openBrackets = (candidate.match(/\[/g) || []).length;
      const closeBrackets = (candidate.match(/]/g) || []).length;

      let balanced = candidate;
      for (let j = 0; j < openBrackets - closeBrackets; j++) balanced += ']';
      for (let j = 0; j < openBraces - closeBraces; j++) balanced += '}';

      try {
        JSON.parse(balanced);
        return balanced;
      } catch {
        continue;
      }
    }
  }
  return null;
}

/** Maximum number of LLM retries when JSON parsing fails */
const JSON_PARSE_MAX_RETRIES = 2;

/**
 * Preprocess raw LLM text to extract JSON content.
 * Strips think blocks, code fences, and finds the start of JSON.
 */
function preprocessLLMText(raw: string): string {
  let text = raw.trim();

  // Strip thinking blocks (some models emit reasoning tokens)
  text = text.replace(/<think[\s\S]*?<\/think>/gi, '').trim();

  // Strip markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*)\n?```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // If the text still doesn't start with '{' or '[', try to find the first JSON object
  if (!text.startsWith('{') && !text.startsWith('[')) {
    const jsonStart = text.indexOf('{');
    const jsonStartArr = text.indexOf('[');
    const earliest = jsonStart === -1 ? jsonStartArr : jsonStartArr === -1 ? jsonStart : Math.min(jsonStart, jsonStartArr);
    if (earliest !== -1) {
      text = text.slice(earliest);
    }
  }

  return text;
}

/**
 * Try all JSON parsing strategies on the given text.
 * Returns parsed object or null if all strategies fail.
 */
function tryParseJSON<T>(text: string): T | null {
  // Strategy 1: Direct parse
  try {
    return JSON.parse(text) as T;
  } catch {
    // continue
  }

  // Strategy 2: Repair then parse
  try {
    const repaired = repairJSON(text);
    return JSON.parse(repaired) as T;
  } catch {
    // continue
  }

  // Strategy 3: Repair + balance brackets
  try {
    let balanced = repairJSON(text);
    const openBraces = (balanced.match(/{/g) || []).length;
    const closeBraces = (balanced.match(/}/g) || []).length;
    const openBrackets = (balanced.match(/\[/g) || []).length;
    const closeBrackets = (balanced.match(/]/g) || []).length;
    for (let i = 0; i < openBraces - closeBraces; i++) balanced += '}';
    for (let i = 0; i < openBrackets - closeBrackets; i++) balanced += ']';
    return JSON.parse(balanced) as T;
  } catch {
    // continue
  }

  // Strategy 4: Extract truncated valid JSON
  try {
    const repaired = repairJSON(text);
    const extracted = extractTruncatedJSON(repaired);
    if (extracted) {
      return JSON.parse(extracted) as T;
    }
  } catch {
    // continue
  }

  return null;
}

/**
 * Convenience: call the LLM and parse the response as JSON.
 * Strips markdown code fences if the model wraps output in ```json ... ```.
 * Includes robust JSON repair and LLM-based retry on parse failure.
 */
export async function createChatCompletionJSON<T = unknown>(
  systemPrompt: string,
  userMessage: string,
  options?: ChatCompletionOptions
): Promise<T> {
  const temperature = options?.temperature ?? 0.5; // Lower temperature for structured output
  let lastRawText = '';

  for (let attempt = 0; attempt <= JSON_PARSE_MAX_RETRIES; attempt++) {
    let effectiveSystemPrompt = systemPrompt;
    let effectiveUserMessage = userMessage;

    // On retry, feed the broken JSON back to the LLM for self-correction
    if (attempt > 0) {
      console.warn(`[JSON] Parse failed (attempt ${attempt}/${JSON_PARSE_MAX_RETRIES}), asking LLM to fix...`);
      effectiveUserMessage = `You previously generated invalid JSON. Here is the broken output:\n\n${lastRawText.slice(0, 2000)}\n\nPlease fix the JSON errors and return ONLY the corrected JSON object. Common issues to fix:\n- Missing colons after keys (e.g. "key" "value" should be "key": "value")\n- Trailing commas before } or ]\n- Unclosed strings or brackets\n- Make sure the JSON is complete, not truncated\n\nOriginal task: ${userMessage.slice(0, 500)}`;
    }

    const result = await createChatCompletion(effectiveSystemPrompt, effectiveUserMessage, {
      ...options,
      temperature: attempt === 0 ? temperature : 0.3, // Even lower temp on retries
    });

    const text = preprocessLLMText(result.content);
    lastRawText = text;

    // Try all parsing strategies
    const parsed = tryParseJSON<T>(text);
    if (parsed !== null) {
      return parsed;
    }

    // If we have retries left, loop continues; otherwise throw
    if (attempt >= JSON_PARSE_MAX_RETRIES) {
      throw new Error(
        `Failed to parse LLM response as JSON after ${JSON_PARSE_MAX_RETRIES + 1} attempts. Raw output (first 500 chars): ${lastRawText.slice(0, 500)}`
      );
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new Error("Unexpected error in createChatCompletionJSON");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
