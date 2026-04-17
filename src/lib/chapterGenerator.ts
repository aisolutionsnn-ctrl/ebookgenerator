/**
 * Chapter Generator Module
 *
 * Phase 2 of the e-book generation pipeline.
 * Generates chapter content using a two-pass Writer+Editor approach:
 *
 *   1. Writer pass: generates a full chapter draft in Markdown.
 *   2. Editor pass: reviews and improves the draft (anti-repetition,
 *      tone consistency, structure alignment with outline).
 *
 * The Writer receives context about previous chapters to maintain
 * narrative continuity and avoid content duplication.
 */

import { createChatCompletion } from "./openRouterClient";
import type { ChapterOutline } from "./bookPlanner";

export interface BookContext {
  title: string;
  subtitle: string;
  audience: string;
  tone: string;
}

// ─── Writer System Prompt ────────────────────────────────────────────

const WRITER_SYSTEM_PROMPT = `You are an expert non-fiction book writer. You write clear, engaging, and informative prose.

Your task is to write a complete book chapter in Markdown format.

WRITING GUIDELINES:
1. Write in a {tone} tone for {audience}.
2. Follow the chapter outline strictly — cover every sub-topic listed.
3. Use proper Markdown: ## for sections, ### for subsections, bullet lists, numbered lists, etc.
4. Each chapter should be 1500–3000 words (thorough but not bloated).
5. Start with a brief hook/intro paragraph, then cover each sub-topic in order, end with a brief summary or transition.
6. Use concrete examples, data points, or anecdotes where appropriate.
7. Do NOT repeat content from previous chapters — each chapter must be self-contained and add NEW information.
8. Do NOT use phrases like "In this chapter we will..." or "As mentioned earlier..." excessively.
9. Do NOT include the chapter title as an # H1 heading — start with ## for the first section.
10. Output ONLY the Markdown content. No meta-commentary, no preamble.`;

// ─── Editor System Prompt ────────────────────────────────────────────

const EDITOR_SYSTEM_PROMPT = `You are a professional book editor specializing in non-fiction.

Your task is to review and improve a chapter draft. Apply the following edits:

EDITORIAL GUIDELINES:
1. Remove repetitive phrases and redundant paragraphs.
2. Eliminate clichés and overused expressions (e.g., "In today's world...", "It goes without saying...").
3. Ensure the tone is consistent: {tone} for {audience}.
4. Verify all sub-topics from the outline are covered. If any are missing, add brief coverage.
5. Improve paragraph transitions and flow.
6. Fix any awkward phrasing or grammar issues.
7. Ensure the chapter is well-structured with clear section headings.
8. Do NOT reduce the chapter length significantly — keep substantive content.
9. Output the FULL improved chapter in Markdown. Do NOT output a diff or summary of changes.
10. Do NOT include the chapter title as an # H1 heading — start with ## for the first section.

Output ONLY the improved Markdown content. No meta-commentary.`;

/**
 * Generate a chapter draft (Writer pass).
 *
 * @param context   - Book-level context (title, audience, tone)
 * @param chapter   - Chapter outline (title + sub-topics)
 * @param chapterNum - 1-based chapter number
 * @param prevSummaries - Summaries of previously generated chapters (for continuity)
 * @param options   - Optional AbortSignal
 * @returns Raw Markdown draft
 */
export async function generateChapterDraft(
  context: BookContext,
  chapter: ChapterOutline,
  chapterNum: number,
  prevSummaries: string[],
  options?: { signal?: AbortSignal }
): Promise<string> {
  const systemPrompt = WRITER_SYSTEM_PROMPT
    .replace("{tone}", context.tone)
    .replace("{audience}", context.audience);

  const prevContext =
    prevSummaries.length > 0
      ? `\n\nCONTEXT FROM PREVIOUS CHAPTERS (do NOT repeat this content):\n${prevSummaries.map((s, i) => `--- Chapter ${i + 1} summary ---\n${s}`).join("\n\n")}`
      : "";

  const subTopicsList = chapter.subTopics
    .map((st, i) => `${i + 1}. ${st}`)
    .join("\n");

  const userMessage = `Write Chapter ${chapterNum}: "${chapter.chapterTitle}" for the book "${context.title}: ${context.subtitle}".

CHAPTER OUTLINE — Sub-topics to cover:
${subTopicsList}
${prevContext}

Write the complete chapter now in Markdown format. Remember: start sections with ##, NOT #. Output ONLY the Markdown.`;

  const result = await createChatCompletion(systemPrompt, userMessage, {
    temperature: 0.75,
    maxTokens: 8192,
    signal: options?.signal,
  });

  return result.content.trim();
}

/**
 * Edit/improve a chapter draft (Editor pass).
 *
 * @param context  - Book-level context
 * @param chapter  - Chapter outline (for reference)
 * @param chapterNum - 1-based chapter number
 * @param draft    - The raw draft Markdown
 * @param options  - Optional AbortSignal
 * @returns Improved Markdown
 */
export async function editChapterDraft(
  context: BookContext,
  chapter: ChapterOutline,
  chapterNum: number,
  draft: string,
  options?: { signal?: AbortSignal }
): Promise<string> {
  const systemPrompt = EDITOR_SYSTEM_PROMPT
    .replace("{tone}", context.tone)
    .replace("{audience}", context.audience);

  const subTopicsList = chapter.subTopics
    .map((st, i) => `${i + 1}. ${st}`)
    .join("\n");

  const userMessage = `Edit and improve Chapter ${chapterNum}: "${chapter.chapterTitle}" of "${context.title}".

EXPECTED SUB-TOPICS:
${subTopicsList}

CHAPTER DRAFT TO EDIT:
${draft}

Output the FULL improved chapter in Markdown. Remember: start sections with ##, NOT #. Output ONLY the improved Markdown.`;

  const result = await createChatCompletion(systemPrompt, userMessage, {
    temperature: 0.4, // Lower temperature for editing — more faithful to original
    maxTokens: 8192,
    signal: options?.signal,
  });

  return result.content.trim();
}

/**
 * Generate a short summary of a chapter (used as context for subsequent chapters).
 * This avoids passing the full chapter text to the next chapter's prompt.
 */
export async function summarizeChapter(
  chapterTitle: string,
  markdown: string,
  options?: { signal?: AbortSignal }
): Promise<string> {
  const systemPrompt = `You are a concise summarizer. Produce a brief 3-5 sentence summary of the following book chapter. Focus on the key points and information covered. Do NOT include any meta-commentary.`;

  // Truncate long chapters to avoid token limits
  const truncatedMarkdown =
    markdown.length > 3000 ? markdown.slice(0, 3000) + "\n[...truncated...]" : markdown;

  const userMessage = `Summarize this chapter: "${chapterTitle}"\n\n${truncatedMarkdown}`;

  const result = await createChatCompletion(systemPrompt, userMessage, {
    temperature: 0.3,
    maxTokens: 512,
    signal: options?.signal,
  });

  return result.content.trim();
}
