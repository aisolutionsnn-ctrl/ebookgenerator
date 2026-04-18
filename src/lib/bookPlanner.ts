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
import { getLanguageInstruction, type LanguageCode } from "./i18n";

export interface ChapterOutline {
  chapterTitle: string;
  subTopics: string[];
}

export interface BookPlan {
  title: string;
  subtitle: string;
  toc: ChapterOutline[];
}

const PLANNER_SYSTEM_PROMPT = `You are an expert non-fiction book architect who designs books that people actually want to read — the kind of table of contents that makes someone click "Buy Now" because they NEED to know what's inside.

Your task: design a compelling, well-structured non-fiction e-book based on the user's prompt.

RULES:
1. You MUST produce a valid JSON object — no extra text, no markdown fences.
2. The book MUST be non-fiction (informative, educational, how-to, guide, reference, etc.).

CHAPTER TITLES — COMPELLING & INTRIGUING:
- Chapter titles should spark CURIOSITY and make the reader need to know what's inside.
- Bad: "Introduction to Time Management" / "The Benefits of Exercise" / "Understanding Budgeting"
- Good: "The 4 AM Myth: Why Everything You Know About Morning Routines Is Wrong" / "The Workout Your Doctor Never Told You About" / "The Budget That Actually Works (And Why Most Don't)"
- Use surprising angles, provocative questions, or bold claims in titles.
- Titles should read like page-turners, not textbook chapters — imagine browsing a bookstore and these titles are what make someone pick up the book.
- Avoid generic labels: "Introduction," "Conclusion," "Getting Started," "Advanced Topics."
- Instead, make even introductory and concluding chapters sound irresistible: "Before You Read Another Word" or "What Nobody Tells You About What Comes Next."

SUB-TOPICS — SPECIFIC & CURIOSITY-DRIVEN:
- Sub-topics should be specific, actionable, and make the reader curious — not vague category labels.
- Bad: "Benefits of meditation" / "Common mistakes" / "Best practices"
- Good: "The 8-minute protocol that outperforms 45-minute sessions" / "The #1 mistake that makes meditation backfire" / "Why "clearing your mind" is the worst meditation advice you'll ever hear"
- Each sub-topic should promise the reader a specific insight, not just announce a topic area.
- Sub-topics should create a narrative thread within each chapter — they should feel like they build toward something, not just list things.

STRUCTURE & PROGRESSION:
- Create 6–12 chapters with 3–5 sub-topics each.
- Follow a logical progression: hook → foundation → core insights → advanced/reveals → synthesis/forward look.
- The TOC should read like a page-turner's table of contents — someone scanning it should feel compelled to read every chapter.
- Every chapter should deliver clear, distinct value. No filler chapters.
- The last chapter should leave the reader with a powerful next step, not a generic wrap-up.

OUTPUT FORMAT (strict JSON):
{
  "title": "Book Title Here (make it catchy and specific)",
  "subtitle": "A Descriptive Subtitle That Promises a Transformation or Key Insight",
  "toc": [
    {
      "chapterTitle": "Compelling Chapter Title That Sparks Curiosity",
      "subTopics": ["Specific, curiosity-driven sub-topic 1", "Specific, curiosity-driven sub-topic 2", "Specific, curiosity-driven sub-topic 3"]
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
  options?: { signal?: AbortSignal; language?: LanguageCode }
): Promise<BookPlan> {
  const languageInstruction = getLanguageInstruction(options?.language ?? "en");

  const userMessage = `Create a book plan based on the following prompt:
${prompt}
${languageInstruction}
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
