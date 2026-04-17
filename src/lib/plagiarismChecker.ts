/**
 * T15: Plagiarism / Similarity Checker Module
 *
 * Analyzes generated chapters for:
 *   - Internal repetition (self-plagiarism between chapters)
 *   - Vague or unsupported claims
 *   - Overused clichés
 *
 * Uses the LLM to perform semantic analysis.
 */

import { createChatCompletionJSON } from "./openRouterClient";

export interface PlagiarismIssue {
  type: "internal_repetition" | "vague_claim" | "cliche";
  description: string;
  severity: "low" | "medium" | "high";
}

export interface PlagiarismResult {
  chapterNumber: number;
  issues: PlagiarismIssue[];
  overallScore: number; // 0-100, 100 = no issues
}

const PLAGIARISM_SYSTEM_PROMPT = `You are a professional editor checking a book chapter for quality issues.

Analyze the chapter for these specific problems:

1. **Internal repetition**: Sections or paragraphs that repeat the same information that was already covered in previous chapters. Be specific about what is repeated.

2. **Vague claims**: Statements presented as facts without evidence, examples, or specifics (e.g., "Studies show..." without citing, "Many people believe..." without context).

3. **Clichés**: Overused phrases and expressions (e.g., "In today's fast-paced world...", "It goes without saying...", "At the end of the day...").

Return a JSON object with:
- issues: array of found problems, each with type, description, and severity
- overallScore: 0-100 score (100 = no issues found, 0 = severe problems)

Be constructive but thorough. Minor stylistic issues should be "low" severity. Significant repetition or unsupported claims should be "medium" or "high".

OUTPUT FORMAT (strict JSON):
{
  "issues": [
    { "type": "internal_repetition", "description": "Paragraph 3 repeats the container sizing advice from Chapter 2", "severity": "medium" }
  ],
  "overallScore": 85
}`;

/**
 * Check a chapter for plagiarism/similarity issues against previous chapters.
 */
export async function checkChapterPlagiarism(
  chapterMarkdown: string,
  previousChaptersMarkdown: string[],
  chapterNumber: number
): Promise<PlagiarismResult> {
  // Truncate long content to avoid token limits
  const truncatedChapter =
    chapterMarkdown.length > 4000
      ? chapterMarkdown.slice(0, 4000) + "\n[...truncated...]"
      : chapterMarkdown;

  const previousContext =
    previousChaptersMarkdown.length > 0
      ? `\n\nPREVIOUS CHAPTERS SUMMARY (for reference — do NOT repeat this content):\n${previousChaptersMarkdown
          .map((md, i) => {
            const truncated = md.length > 1500 ? md.slice(0, 1500) + "..." : md;
            return `--- Chapter ${i + 1} excerpt ---\n${truncated}`;
          })
          .join("\n\n")}`
      : "\n(No previous chapters — this is the first chapter)";

  const userMessage = `Check Chapter ${chapterNumber} for quality issues:

${previousContext}

CHAPTER TO CHECK:
${truncatedChapter}

Respond with ONLY the JSON object following the exact schema specified.`;

  const result = await createChatCompletionJSON<Omit<PlagiarismResult, "chapterNumber">>(
    PLAGIARISM_SYSTEM_PROMPT,
    userMessage,
    { temperature: 0.3, maxTokens: 1024 }
  );

  return {
    chapterNumber,
    issues: result.issues || [],
    overallScore: result.overallScore ?? 80,
  };
}
