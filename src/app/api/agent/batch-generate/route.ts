import { NextRequest, NextResponse } from "next/server";
import { createChatCompletionJSON } from "@/lib/openRouterClient";
import { db } from "@/lib/db";
import { BATCH_BOOK_ANGLES_PROMPT } from "@/lib/agent/prompts";
import type { BatchGenerateApiRequest, CompetitionResult } from "@/lib/agent/types";

interface BookAngle {
  angle: string;
  title: string;
  targetAudience: string;
  differentiator: string;
}

interface BatchAnglesResult {
  books: BookAngle[];
}

export async function POST(request: NextRequest) {
  try {
    const body: BatchGenerateApiRequest = await request.json();
    const { sessionId, niche, subNiche, customNiche, bookCount } = body;

    if (!sessionId || !niche || !subNiche || !bookCount) {
      return NextResponse.json(
        { error: "Missing required fields: sessionId, niche, subNiche, bookCount" },
        { status: 400 }
      );
    }

    if (bookCount < 1 || bookCount > 10) {
      return NextResponse.json(
        { error: "bookCount must be between 1 and 10" },
        { status: 400 }
      );
    }

    // ── Step 1: Fetch session and competition data ──────────────────────
    const session = await db.agentSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Agent session not found" },
        { status: 404 }
      );
    }

    if (!session.competitionDataJson) {
      return NextResponse.json(
        { error: "Competition research must be completed before batch generation" },
        { status: 400 }
      );
    }

    const competitionData: CompetitionResult = JSON.parse(session.competitionDataJson);

    // ── Step 2: Generate unique angles for each book ────────────────────
    const userMessage = [
      `Generate ${bookCount} unique ebook angles for the following niche:`,
      ``,
      `Niche: ${niche}`,
      `Sub-Niche: ${subNiche}`,
      customNiche ? `Custom Niche: ${customNiche}` : null,
      `Number of books to generate: ${bookCount}`,
      ``,
      `Competition analysis summary:`,
      `- Average price: ${competitionData.averagePrice}`,
      `- Price range: $${competitionData.priceRange.min} - $${competitionData.priceRange.max}`,
      `- Average length: ${competitionData.averageLength}`,
      `- Common formats: ${competitionData.commonFormats.join(", ")}`,
      `- Market gaps: ${competitionData.marketGaps.join("; ")}`,
      `- Suggested angles from competition research: ${competitionData.suggestedAngles.join("; ")}`,
      ``,
      `Each book should target a DIFFERENT angle so they don't compete with each other.`,
    ]
      .filter(Boolean)
      .join("\n");

    const anglesResult = await createChatCompletionJSON<BatchAnglesResult>(
      BATCH_BOOK_ANGLES_PROMPT,
      userMessage
    );

    const books = anglesResult.books ?? [];

    if (books.length === 0) {
      return NextResponse.json(
        { error: "LLM failed to generate any book angles" },
        { status: 500 }
      );
    }

    // Trim to the requested count in case the LLM returned more
    const selectedBooks = books.slice(0, bookCount);

    // ── Step 3: Create Book records for each angle ──────────────────────
    const createdBooks = await Promise.all(
      selectedBooks.map((angle) =>
        db.book.create({
          data: {
            prompt: `Write a comprehensive ebook about ${angle.title}. ${angle.differentiator}. Target audience: ${angle.targetAudience}. Niche: ${subNiche}`,
            audience: angle.targetAudience,
            tone: "Informative and engaging",
            lengthHint: "Medium (8-12 chapters)",
            language: "en",
            pdfTemplate: "professional",
            status: "PLANNING",
            userId: session.userId,
          },
        })
      )
    );

    const bookIds = createdBooks.map((b) => b.id);

    // ── Step 4: Update session with generated book IDs ──────────────────
    await db.agentSession.update({
      where: { id: sessionId },
      data: {
        generatedBookIds: JSON.stringify(bookIds),
        currentStep: 2,
        bookCount: bookIds.length,
      },
    });

    return NextResponse.json({
      sessionId,
      bookIds,
      books: selectedBooks.map((angle, i) => ({
        id: createdBooks[i].id,
        angle: angle.angle,
        title: angle.title,
        targetAudience: angle.targetAudience,
        differentiator: angle.differentiator,
      })),
    });
  } catch (error) {
    console.error("[Batch Generate API] Error:", error);
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
