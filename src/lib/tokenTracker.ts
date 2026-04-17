/**
 * T42: Token/Cost Tracking Module
 *
 * Tracks LLM API token usage and estimated costs across the
 * book generation pipeline. Persists usage data in the book record.
 *
 * Cost estimation:
 * - Free models (qwen/qwen3-coder:free, z-ai-sdk): $0/M tokens
 * - OpenRouter paid models: rates vary by model
 * - Default assumption: free tier
 */

export interface TokenCallRecord {
  phase: string; // "planning" | "writing" | "editing" | "summarizing" | "metadata" | "factcheck" | "plagiarism"
  promptTokens: number;
  completionTokens: number;
  timestamp: string;
}

export interface TokenUsage {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  calls: TokenCallRecord[];
}

const COST_PER_M_TOKENS = 0; // Free tier default — update if using paid models

export class TokenTracker {
  private calls: TokenCallRecord[] = [];

  /**
   * Record a single LLM API call's token usage.
   */
  recordCall(phase: string, promptTokens: number, completionTokens: number): void {
    this.calls.push({
      phase,
      promptTokens,
      completionTokens,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Record usage from an LLM response (handles null/undefined gracefully).
   */
  recordFromResult(
    phase: string,
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
  ): void {
    const pt = usage?.promptTokens ?? 0;
    const ct = usage?.completionTokens ?? 0;
    // If no usage data, estimate from total (rough: 4 chars per token)
    this.recordCall(phase, pt, ct);
  }

  /**
   * Estimate token count from text length (4 chars per token approximation).
   */
  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Record an estimated call when exact usage isn't available (e.g., z-ai-sdk).
   */
  recordEstimated(phase: string, inputText: string, outputText: string): void {
    const pt = TokenTracker.estimateTokens(inputText);
    const ct = TokenTracker.estimateTokens(outputText);
    this.recordCall(phase, pt, ct);
  }

  /**
   * Get the aggregated usage summary.
   */
  getUsage(): TokenUsage {
    const totalPromptTokens = this.calls.reduce((sum, c) => sum + c.promptTokens, 0);
    const totalCompletionTokens = this.calls.reduce((sum, c) => sum + c.completionTokens, 0);
    const totalTokens = totalPromptTokens + totalCompletionTokens;
    const estimatedCost = (totalTokens / 1_000_000) * COST_PER_M_TOKENS;

    return {
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      estimatedCost,
      calls: [...this.calls],
    };
  }

  /**
   * Serialize to JSON string for database storage.
   */
  toJSON(): string {
    return JSON.stringify(this.getUsage());
  }
}

/**
 * Create a new token tracker instance.
 */
export function createTokenTracker(): TokenTracker {
  return new TokenTracker();
}
