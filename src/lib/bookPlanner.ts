/**
 * Book Planner Module
 *
 * Phase 1 of the e-book generation pipeline.
 * Takes a user prompt and generates a structured book plan:
 *   - Title and subtitle
 *   - Table of contents (chapters + sub-topics)
 *
 * Uses OpenRouter's chat completions with a structured system prompt
 * that enforces non-fiction genre and returns a strict JSON schema.
 */

import { createChatCompletionJSON } from "./openRouterClient";

export interface ChapterOutline {
  chapterTitle: string;
  subTopics: string[];
}

export interface BookPlan {
  title: string;
  subtitle: string;
  toc: ChapterOutline[];
}

const PLANNER_SYSTEM_PROMPT = `You are an expert non-fiction book planner and outline architect.

Your task is to design a well-structured non-fiction e-book based on the user's prompt.

RULES:
1. You MUST produce a valid JSON object — no extra text, no markdown fences.
2. The book MUST be non-fiction (informative, educational, how-to, guide, reference, etc.).
3. Generate a compelling title and subtitle.
4. Create a logical table of contents with 6–12 chapters.
5. Each chapter MUST have 3–5 sub-topics that break down what the chapter covers.
6. Chapters should follow a logical progression: introduction → core topics → advanced topics → conclusion.
7. Avoid filler chapters; every chapter should deliver clear value.
8. Sub-topic names should be specific and actionable, not vague.

OUTPUT FORMAT (strict JSON):
{
  "title": "Book Title Here",
  "subtitle": "A Descriptive Subtitle Here",
  "toc": [
    {
      "chapterTitle": "Chapter 1 Title",
      "subTopics": ["Sub-topic 1", "Sub-topic 2", "Sub-topic 3"]
    }
  ]
}

Respond with ONLY the JSON object. No explanations, no preamble.`;

/**
 * Generate a book plan from a user prompt.
 *
 * @param prompt - The user's high-level description (topic, audience, tone, length)
 * @param options - Optional overrides (e.g., signal for cancellation)
 * @returns A structured BookPlan with title, subtitle, and table of contents
 */
export async function planBook(
  prompt: string,
  options?: { signal?: AbortSignal }
): Promise<BookPlan> {
  const userMessage = `Create a book plan based on the following prompt:

${prompt}

Remember: respond with ONLY the JSON object following the exact schema specified.`;

  const plan = await createChatCompletionJSON<BookPlan>(
    PLANNER_SYSTEM_PROMPT,
    userMessage,
    {
      temperature: 0.6,
      maxTokens: 4096,
      signal: options?.signal,
    }
  );

  // Validate the plan structure
  if (!plan.title || typeof plan.title !== "string") {
    throw new Error("Book plan missing valid 'title' field.");
  }
  if (!plan.subtitle || typeof plan.subtitle !== "string") {
    throw new Error("Book plan missing valid 'subtitle' field.");
  }
  if (!Array.isArray(plan.toc) || plan.toc.length === 0) {
    throw new Error("Book plan missing valid 'toc' array.");
  }

  // Ensure each chapter has the required fields
  for (let i = 0; i < plan.toc.length; i++) {
    const ch = plan.toc[i];
    if (!ch.chapterTitle || typeof ch.chapterTitle !== "string") {
      throw new Error(`Chapter ${i + 1} missing valid 'chapterTitle'.`);
    }
    if (!Array.isArray(ch.subTopics) || ch.subTopics.length === 0) {
      throw new Error(
        `Chapter "${ch.chapterTitle}" missing valid 'subTopics' array.`
      );
    }
  }

  return plan;
}
