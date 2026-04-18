import { NextRequest, NextResponse } from "next/server";
import { createChatCompletionJSON } from "@/lib/openRouterClient";
import { db } from "@/lib/db";
import { BATCH_BOOK_ANGLES_PROMPT } from "@/lib/agent/prompts";
import { enqueueBookJob } from "@/lib/jobQueue";
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
    const { sessionId, niche, subNiche, customNiche } = body;

    if (!sessionId || !niche || !subNiche) {
      return NextResponse.json(
        { error: "Missing required fields: sessionId, niche, subNiche" },
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
        { error: "Competition research must be completed before generating a book" },
        { status: 400 }
      );
    }

    const competitionData: CompetitionResult = JSON.parse(session.competitionDataJson);

    // ── Step 2: Generate the best unique angle for ONE book ────────────────
    const userMessage = [
      `Generate the SINGLE BEST ebook angle for the following niche:`,
      ``,
      `Niche: ${niche}`,
      `Sub-Niche: ${subNiche}`,
      customNiche ? `Custom Niche: ${customNiche}` : null,
      ``,
      `Competition analysis summary:`,
      `- Average price: ${competitionData.averagePrice}`,
      `- Price range: $${competitionData.priceRange.min} - $${competitionData.priceRange.max}`,
      `- Average length: ${competitionData.averageLength}`,
      `- Common formats: ${competitionData.commonFormats.join(", ")}`,
      `- Market gaps: ${competitionData.marketGaps.join("; ")}`,
      `- Suggested angles from competition research: ${competitionData.suggestedAngles.join("; ")}`,
      ``,
      `Find the MOST unique and profitable angle that fills a real gap in the market. The book must stand out from ALL competitors.`,
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

    // Take only the first (best) angle
    const bestAngle = books[0];

    // ── Step 3: Create ONE Book record ──────────────────────────────────
    const createdBook = await db.book.create({
      data: {
        prompt: `Write a comprehensive ebook about ${bestAngle.title}. ${bestAngle.differentiator}. Target audience: ${bestAngle.targetAudience}. Niche: ${subNiche}`,
        audience: bestAngle.targetAudience,
        tone: "Informative and engaging",
        lengthHint: "Medium (8-12 chapters)",
        language: "en",
        pdfTemplate: "professional",
        status: "PLANNING",
        userId: session.userId,
      },
    });

    const bookIds = [createdBook.id];

    // ── Step 4: Update session ──────────────────────────────────────────
    await db.agentSession.update({
      where: { id: sessionId },
      data: {
        generatedBookIds: JSON.stringify(bookIds),
        currentStep: 2,
        bookCount: 1,
      },
    });

    // ── Step 5: Enqueue the book into the generation pipeline ───────────
    enqueueBookJob(createdBook.id);

    return NextResponse.json({
      sessionId,
      bookIds,
      books: [{
        id: createdBook.id,
        angle: bestAngle.angle,
        title: bestAngle.title,
        targetAudience: bestAngle.targetAudience,
        differentiator: bestAngle.differentiator,
      }],
    });
  } catch (error) {
    console.error("[Book Generate API] Error:", error);
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
