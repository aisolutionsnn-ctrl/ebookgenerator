import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
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

    // ── Step 1: Web search for competition data ─────────────────────────
    const zai = await ZAI.create();

    const [searchResult1, searchResult2] = await Promise.all([
      zai.functions.invoke("web_search", {
        query: `ebook ${subNiche} site:amazon.com OR site:gumroad.com OR site:payhip.com`,
        num: 8,
      }),
      zai.functions.invoke("web_search", {
        query: `best ${subNiche} ebooks buy`,
        num: 8,
      }),
    ]);

    // Format search results for the LLM
    const searchContext = [
      "=== SEARCH RESULTS: Platform Listings ===",
      JSON.stringify(searchResult1, null, 2),
      "",
      "=== SEARCH RESULTS: Best Ebooks to Buy ===",
      JSON.stringify(searchResult2, null, 2),
    ].join("\n");

    // ── Step 2: LLM competition analysis ────────────────────────────────
    const userMessage = [
      `Analyze the competition for ebooks in this niche:`,
      ``,
      `Niche: ${niche}`,
      `Sub-Niche: ${subNiche}`,
      customNiche ? `Custom Niche: ${customNiche}` : null,
      ``,
      `Here is real web search data about competing ebooks:`,
      searchContext,
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

    // ── Step 3: Update session in database ──────────────────────────────
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
