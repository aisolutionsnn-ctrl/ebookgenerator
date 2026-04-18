import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { createChatCompletionJSON } from "@/lib/openRouterClient";
import { db } from "@/lib/db";
import { NICHE_RESEARCH_SYSTEM_PROMPT } from "@/lib/agent/prompts";
import type { NicheResearchRequest, NicheResearchResult } from "@/lib/agent/types";

export async function POST(request: NextRequest) {
  try {
    const body: NicheResearchRequest = await request.json();
    const { niche, subNiche, customNiche } = body;

    if (!niche || (!subNiche && !customNiche)) {
      return NextResponse.json(
        { error: "Missing required fields: niche, and either subNiche or customNiche" },
        { status: 400 }
      );
    }

    const effectiveSubNiche = customNiche || subNiche;

    // ── Step 1: Web search for market data (resilient — failures don't crash) ──
    let searchContext = "No web search data available — proceed with general knowledge.";

    try {
      const zai = await ZAI.create();

      const [searchResult1, searchResult2] = await Promise.allSettled([
        zai.functions.invoke("web_search", {
          query: `ebook ${effectiveSubNiche} market trends profitability 2024 2025`,
          num: 8,
        }),
        zai.functions.invoke("web_search", {
          query: `best selling ebooks ${effectiveSubNiche} ${niche}`,
          num: 8,
        }),
      ]);

      const parts: string[] = [];
      if (searchResult1.status === "fulfilled") {
        parts.push("=== SEARCH RESULTS: Market Trends ===\n" + JSON.stringify(searchResult1.value, null, 2));
      } else {
        console.warn("[Niche Research] Search 1 failed:", searchResult1.reason);
      }
      if (searchResult2.status === "fulfilled") {
        parts.push("=== SEARCH RESULTS: Best Selling Ebooks ===\n" + JSON.stringify(searchResult2.value, null, 2));
      } else {
        console.warn("[Niche Research] Search 2 failed:", searchResult2.reason);
      }

      if (parts.length > 0) {
        searchContext = parts.join("\n\n");
      }
    } catch (searchErr) {
      console.warn("[Niche Research] Web search failed entirely:", searchErr);
      // Continue without search data
    }

    // ── Step 2: LLM analysis ────────────────────────────────────────────
    const userMessage = [
      `Analyze the following niche for ebook profitability:`,
      ``,
      `Niche: ${niche}`,
      `Sub-Niche: ${effectiveSubNiche}`,
      customNiche ? `Custom Niche: ${customNiche}` : null,
      ``,
      `Here is real web search data to inform your analysis:`,
      searchContext,
    ]
      .filter(Boolean)
      .join("\n");

    const nicheData = await createChatCompletionJSON<NicheResearchResult>(
      NICHE_RESEARCH_SYSTEM_PROMPT,
      userMessage
    );

    // Inject the niche/subNiche fields for consistency
    const result: NicheResearchResult = {
      niche,
      subNiche: effectiveSubNiche,
      customNiche: customNiche ?? null,
      profitability: nicheData.profitability ?? 5,
      demand: nicheData.demand ?? 5,
      competition: nicheData.competition ?? 5,
      potential: nicheData.potential ?? 5,
      suggestedSubNiches: nicheData.suggestedSubNiches ?? [],
      searchInsights: nicheData.searchInsights ?? "No insights available.",
    };

    // ── Step 3: Save to database ────────────────────────────────────────
    const session = await db.agentSession.create({
      data: {
        niche,
        subNiche: effectiveSubNiche,
        customNiche: customNiche ?? null,
        bookCount: 1,
        currentStep: 1,
        status: "active",
        nicheDataJson: JSON.stringify(result),
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      result,
    });
  } catch (error) {
    console.error("[Niche Research API] Error:", error);
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
