/**
 * POST /api/agent/quality-assess
 *
 * Agent 3: Quality Assessment
 * Evaluates each generated book on content, structure, originality,
 * readability, SEO potential, and value for the buyer.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createChatCompletionJSON } from "@/lib/openRouterClient";
import { QUALITY_ASSESSMENT_SYSTEM_PROMPT } from "@/lib/agent/prompts";
import type {
  QualityAssessmentResult,
  QualityAssessRequest,
  CompetitionResult,
} from "@/lib/agent/types";

export async function POST(request: NextRequest) {
  try {
    const body: QualityAssessRequest = await request.json();
    const { sessionId, bookIds } = body;

    // ── Validate ───────────────────────────────────────────────────────
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "sessionId is required." },
        { status: 400 }
      );
    }
    if (!Array.isArray(bookIds) || bookIds.length === 0) {
      return NextResponse.json(
        { error: "bookIds must be a non-empty array." },
        { status: 400 }
      );
    }

    // ── Fetch session for competition context ──────────────────────────
    const session = await db.agentSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      return NextResponse.json(
        { error: "AgentSession not found." },
        { status: 404 }
      );
    }

    let competitionData: CompetitionResult | null = null;
    if (session.competitionDataJson) {
      try {
        competitionData = JSON.parse(session.competitionDataJson);
      } catch {
        console.warn("[QualityAssess] Failed to parse competitionDataJson");
      }
    }

    // ── Assess each book ───────────────────────────────────────────────
    const results: QualityAssessmentResult[] = [];

    for (const bookId of bookIds) {
      const book = await db.book.findUnique({
        where: { id: bookId },
        include: { chapters: { orderBy: { chapterNumber: "asc" } } },
      });

      if (!book) {
        console.warn(`[QualityAssess] Book ${bookId} not found, skipping.`);
        continue;
      }

      // Construct summary
      const chapterList = book.chapters
        .map((ch) => `- Chapter ${ch.chapterNumber}: ${ch.title}`)
        .join("\n");

      const contentSamples = book.chapters
        .map(
          (ch) =>
            `### Chapter ${ch.chapterNumber}: ${ch.title}\n${
              ch.markdown?.slice(0, 500) ?? "(no content yet)"
            }`
        )
        .join("\n\n");

      const competitionContext = competitionData
        ? `Competition analysis: average price ${competitionData.averagePrice}, ` +
          `price range $${competitionData.priceRange.min}-$${competitionData.priceRange.max}, ` +
          `market gaps: ${competitionData.marketGaps.join("; ")}, ` +
          `suggested angles: ${competitionData.suggestedAngles.join("; ")}`
        : "No competition data available.";

      const userMessage = [
        `Book Title: ${book.title ?? "Untitled"}`,
        `Subtitle: ${book.subtitle ?? "N/A"}`,
        `Topic/Prompt: ${book.prompt}`,
        `Tone: ${book.tone}`,
        `Audience: ${book.audience}`,
        "",
        "Chapter List:",
        chapterList,
        "",
        "Content Samples (first 500 chars per chapter):",
        contentSamples,
        "",
        "Competition Context:",
        competitionContext,
      ].join("\n");

      try {
        const llmResult = await createChatCompletionJSON<{
          scores: QualityAssessmentResult["scores"];
          overallScore: number;
          passed: boolean;
          suggestions: string[];
          strengths: string[];
        }>(QUALITY_ASSESSMENT_SYSTEM_PROMPT, userMessage);

        const assessment: QualityAssessmentResult = {
          bookId,
          bookTitle: book.title ?? "Untitled",
          scores: llmResult.scores,
          overallScore: llmResult.overallScore,
          passed: llmResult.passed,
          suggestions: llmResult.suggestions,
          strengths: llmResult.strengths,
        };

        results.push(assessment);
      } catch (llmErr) {
        console.error(
          `[QualityAssess] LLM failed for book ${bookId}:`,
          llmErr
        );
        // Push a failed assessment so the client knows this book was attempted
        results.push({
          bookId,
          bookTitle: book.title ?? "Untitled",
          scores: {
            content: 0,
            structure: 0,
            originality: 0,
            readability: 0,
            seoPotential: 0,
            valueForBuyer: 0,
          },
          overallScore: 0,
          passed: false,
          suggestions: ["Quality assessment failed — LLM error."],
          strengths: [],
        });
      }
    }

    // ── Update session ─────────────────────────────────────────────────
    await db.agentSession.update({
      where: { id: sessionId },
      data: {
        evaluationDataJson: JSON.stringify(results),
        currentStep: 3,
      },
    });

    return NextResponse.json({ results });
  } catch (err: unknown) {
    console.error("[API] POST /api/agent/quality-assess error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
