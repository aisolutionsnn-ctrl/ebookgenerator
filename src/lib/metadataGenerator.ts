/**
 * T19: Metadata Generator Module
 *
 * Generates book metadata automatically:
 *   - Keywords (SEO)
 *   - Abstract / description
 *   - ISBN placeholder
 *   - Copyright page
 *   - Subject category (BISAC)
 *   - Language
 */

import { createChatCompletionJSON } from "./openRouterClient";

export interface BookMetadata {
  keywords: string[];
  abstract: string;
  isbnPlaceholder: string;
  copyrightYear: number;
  copyrightPage: string;
  language: string;
  subject: string;
}

const METADATA_SYSTEM_PROMPT = `You are a professional book metadata generator for non-fiction e-books.

Given a book's title, subtitle, table of contents, and the original prompt, generate comprehensive metadata.

RULES:
1. Return ONLY a valid JSON object — no extra text, no markdown fences.
2. Keywords: 5-10 relevant SEO keywords/phrases.
3. Abstract: 150-300 word description suitable for a book listing page.
4. ISBN: Generate a placeholder ISBN-13 format (978-X-XXXX-XXXX-X).
5. Copyright page: Generate a full copyright page in Markdown including:
   - Copyright notice with year and author placeholder
   - All rights reserved statement
   - Disclaimer about AI-generated content
   - Edition notice
6. Subject: A BISAC subject category description (e.g., "BUSINESS & ECONOMICS / Personal Finance / General").
7. Language: The primary language of the book (ISO 639-1 code, e.g., "en").

OUTPUT FORMAT (strict JSON):
{
  "keywords": ["keyword1", "keyword2", ...],
  "abstract": "A 150-300 word description...",
  "isbnPlaceholder": "978-0-0000-0000-0",
  "copyrightYear": 2025,
  "copyrightPage": "Copyright © 2025...\\n\\nAll rights reserved...\\n\\n...",
  "language": "en",
  "subject": "BUSINESS & ECONOMICS / Personal Finance / General"
}`;

/**
 * Generate book metadata from the book plan.
 */
export async function generateBookMetadata(
  title: string,
  subtitle: string,
  tocJson: string,
  prompt: string,
  language: string = "en"
): Promise<BookMetadata> {
  let tocPreview: string;
  try {
    const toc = JSON.parse(tocJson);
    tocPreview = toc
      .slice(0, 8) // Limit to avoid token overflow
      .map((ch: { chapterTitle?: string }, i: number) => `${i + 1}. ${ch.chapterTitle || "Untitled"}`)
      .join("\n");
  } catch {
    tocPreview = "Table of contents unavailable";
  }

  const userMessage = `Generate metadata for this book:

Title: ${title}
Subtitle: ${subtitle}
Language: ${language}

Table of Contents:
${tocPreview}

Original Prompt: ${prompt.slice(0, 500)}

Respond with ONLY the JSON object following the exact schema specified.`;

  const metadata = await createChatCompletionJSON<BookMetadata>(
    METADATA_SYSTEM_PROMPT,
    userMessage,
    { temperature: 0.4, maxTokens: 2048 }
  );

  // Validate required fields
  if (!metadata.keywords || !Array.isArray(metadata.keywords)) {
    metadata.keywords = [title];
  }
  if (!metadata.abstract || typeof metadata.abstract !== "string") {
    metadata.abstract = `A comprehensive guide: ${title} — ${subtitle}`;
  }
  if (!metadata.copyrightYear || typeof metadata.copyrightYear !== "number") {
    metadata.copyrightYear = new Date().getFullYear();
  }
  if (!metadata.language) {
    metadata.language = language;
  }

  return metadata;
}
