import { NextRequest, NextResponse } from "next/server";
import { createChatCompletionJSON } from "@/lib/openRouterClient";
import { db } from "@/lib/db";
import { COMPETITION_RESEARCH_SYSTEM_PROMPT } from "@/lib/agent/prompts";
import type { CompetitionResearchRequest, CompetitionResult } from "@/lib/agent/types";

export async function POST(request: NextRequest) {
  try {
    const body: CompetitionResearchRequest = await request.json();
    const { sessionId, niche, subNiche, customNiche } = body;

    if (!sessionId || !niche || !subNiche) {
      return NextResponse.json(
        { error: "Missing required fields: sessionId, niche, subNiche" },
        { status: 400 }
      );
    }

    // Verify the session exists
    const session = await db.agentSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Agent session not found" },
        { status: 404 }
      );
    }

    // ── Step 1: Web search skipped (ZAI disabled) ───────────────────────
    const searchContext = "Web search unavailable — use general market knowledge to perform competition analysis.";
    const topUrls: string[] = [];

    // ── Step 2: Deep web reading skipped (ZAI disabled) ─────────────────
    const deepReadingContext = "";

    // ── Step 3: LLM competition analysis ────────────────────────────────
    const userMessage = [
      `Analyze the competition for ebooks in this niche:`,
      ``,
      `Niche: ${niche}`,
      `Sub-Niche: ${subNiche}`,
      customNiche ? `Custom Niche: ${customNiche}` : null,
      ``,
      `Here is real web search data about competing ebooks:`,
      searchContext,
      ``,
      deepReadingContext ? `Here is deeper content from reading competitor web pages. Extract specific book titles, prices, ratings, descriptions, and reader feedback:` : null,
      deepReadingContext || null,
    ]
      .filter(Boolean)
      .join("\n");

    const competitionData = await createChatCompletionJSON<CompetitionResult>(
      COMPETITION_RESEARCH_SYSTEM_PROMPT,
      userMessage
    );

    // Inject the niche/subNiche fields for consistency
    const result: CompetitionResult = {
      niche,
      subNiche,
      competitors: competitionData.competitors ?? [],
      averagePrice: competitionData.averagePrice ?? "$9.99",
      priceRange: competitionData.priceRange ?? { min: 4.99, max: 14.99, currency: "USD" },
      averageLength: competitionData.averageLength ?? "80-120 pages",
      commonFormats: competitionData.commonFormats ?? ["PDF", "EPUB"],
      marketGaps: competitionData.marketGaps ?? [],
      suggestedAngles: competitionData.suggestedAngles ?? [],
    };

    // ── Step 4: Update session in database ──────────────────────────────
    await db.agentSession.update({
      where: { id: sessionId },
      data: {
        competitionDataJson: JSON.stringify(result),
        currentStep: 2,
      },
    });

    return NextResponse.json({
      sessionId,
      result,
    });
  } catch (error) {
    console.error("[Competition Research API] Error:", error);
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
