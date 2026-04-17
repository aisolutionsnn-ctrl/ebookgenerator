/**
 * T20: Fact-Checking Module
 *
 * Analyzes generated chapters for factual accuracy.
 * Identifies claims and evaluates their likely accuracy.
 *
 * Note: This uses the LLM as a knowledge reference, which has limitations.
 * It catches common misconceptions and obvious errors but cannot verify
 * every factual claim with certainty.
 */

import { createChatCompletionJSON } from "./openRouterClient";

export interface FactClaim {
  claim: string;
  verdict: "likely_accurate" | "uncertain" | "potentially_inaccurate";
  reasoning: string;
  suggestion?: string;
}

export interface FactCheckResult {
  chapterNumber: number;
  claims: FactClaim[];
  overallReliability: number; // 0-100
}

const FACTCHECK_SYSTEM_PROMPT = `You are a meticulous fact-checker for non-fiction books.

Your task is to identify factual claims in the provided chapter text and evaluate their accuracy based on your knowledge.

RULES:
1. Focus on concrete factual claims (statistics, dates, scientific facts, historical events, etc.).
2. Do NOT check opinions or subjective statements.
3. For each claim, provide your assessment:
   - "likely_accurate": Consistent with established knowledge
   - "uncertain": Cannot be verified with confidence, or the claim is oversimplified
   - "potentially_inaccurate": Contradicts established knowledge or contains common misconceptions
4. For "uncertain" or "potentially_inaccurate" claims, suggest how to fix or qualify them.
5. Be generous — only flag claims that are clearly questionable. Many general statements in non-fiction are acceptable even if slightly simplified.
6. Return an overallReliability score: 0-100 (100 = all claims appear accurate).

OUTPUT FORMAT (strict JSON):
{
  "claims": [
    {
      "claim": "The specific claim from the text",
      "verdict": "likely_accurate",
      "reasoning": "Why you assessed it this way",
      "suggestion": "Optional: how to improve it"
    }
  ],
  "overallReliability": 90
}`;

/**
 * Fact-check a chapter's content for accuracy.
 */
export async function factCheckChapter(
  chapterMarkdown: string,
  chapterNumber: number
): Promise<FactCheckResult> {
  // Truncate long content
  const truncated =
    chapterMarkdown.length > 5000
      ? chapterMarkdown.slice(0, 5000) + "\n[...truncated...]"
      : chapterMarkdown;

  const userMessage = `Fact-check Chapter ${chapterNumber}:

${truncated}

Identify concrete factual claims and assess their accuracy. Respond with ONLY the JSON object.`;

  const result = await createChatCompletionJSON<Omit<FactCheckResult, "chapterNumber">>(
    FACTCHECK_SYSTEM_PROMPT,
    userMessage,
    { temperature: 0.3, maxTokens: 2048 }
  );

  return {
    chapterNumber,
    claims: result.claims || [],
    overallReliability: result.overallReliability ?? 75,
  };
}
