/**
 * POST /api/agent/cover-prompt
 *
 * Agent 5: Cover Image Prompt Generation
 * Creates a detailed AI image prompt for the ebook cover and optionally
 * generates the cover image using z-ai-web-dev-sdk.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createChatCompletionJSON } from "@/lib/openRouterClient";
import { COVER_PROMPT_SYSTEM_PROMPT } from "@/lib/agent/prompts";
import type {
  CoverPromptResult,
  CoverStyle,
  CoverPromptRequest,
} from "@/lib/agent/types";

export async function POST(request: NextRequest) {
  try {
    const body: CoverPromptRequest = await request.json();
    const { sessionId, bookId, style, generateImage } = body;

    // ── Validate ───────────────────────────────────────────────────────
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "sessionId is required." },
        { status: 400 }
      );
    }
    if (!bookId || typeof bookId !== "string") {
      return NextResponse.json(
        { error: "bookId is required." },
        { status: 400 }
      );
    }

    // ── Fetch session ──────────────────────────────────────────────────
    const session = await db.agentSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      return NextResponse.json(
        { error: "AgentSession not found." },
        { status: 404 }
      );
    }

    // ── Fetch book with chapters ───────────────────────────────────────
    const book = await db.book.findUnique({
      where: { id: bookId },
      include: { chapters: { orderBy: { chapterNumber: "asc" } } },
    });
    if (!book) {
      return NextResponse.json(
        { error: "Book not found." },
        { status: 404 }
      );
    }

    const bookTitle = book.title ?? "Untitled";
    const chapterTitles = book.chapters
      .map((ch) => ch.title)
      .join(", ");

    // ── Build LLM prompt ───────────────────────────────────────────────
    const userMessage = [
      `Book Title: ${bookTitle}`,
      `Subtitle: ${book.subtitle ?? "N/A"}`,
      `Topic/Prompt: ${book.prompt}`,
      `Tone: ${book.tone}`,
      `Audience: ${book.audience}`,
      "",
      `Chapter Titles: ${chapterTitles || "No chapters yet"}`,
    ].join("\n");

    const llmResult = await createChatCompletionJSON<{
      prompt: string;
      styleOptions: CoverStyle[];
    }>(COVER_PROMPT_SYSTEM_PROMPT, userMessage);

    let coverPrompt = llmResult.prompt;
    const styleOptions = llmResult.styleOptions;

    // ── Optionally generate image ──────────────────────────────────────
    // Image generation via ZAI is disabled — use the generated prompt with an external tool.
    const imagePath: string | null = null;

    if (generateImage) {
      console.log("[CoverPrompt] Image generation skipped (ZAI disabled). Use the generated prompt with an external image tool.");
    }

    // ── Build result ───────────────────────────────────────────────────
    const coverResult: CoverPromptResult = {
      bookId,
      bookTitle,
      prompt: coverPrompt,
      styleOptions,
      generatedImagePath: imagePath,
    };

    // ── Update session ─────────────────────────────────────────────────
    // Append to existing coverData or start a new array
    let existingCoverData: CoverPromptResult[] = [];
    if (session.coverDataJson) {
      try {
        existingCoverData = JSON.parse(session.coverDataJson);
      } catch {
        existingCoverData = [];
      }
    }

    // Replace existing entry for the same bookId, or append
    const updatedCoverData = existingCoverData.filter(
      (c) => c.bookId !== bookId
    );
    updatedCoverData.push(coverResult);

    await db.agentSession.update({
      where: { id: sessionId },
      data: {
        coverDataJson: JSON.stringify(updatedCoverData),
        currentStep: 5,
      },
    });

    // Also update the book's coverImagePath if an image was generated
    if (imagePath) {
      await db.book.update({
        where: { id: bookId },
        data: { coverImagePath: imagePath },
      });
    }

    return NextResponse.json({ result: coverResult });
  } catch (err: unknown) {
    console.error("[API] POST /api/agent/cover-prompt error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
