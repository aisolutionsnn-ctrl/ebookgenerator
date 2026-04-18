import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { createChatCompletionJSON } from "@/lib/openRouterClient";
import { db } from "@/lib/db";
import { NICHE_RESEARCH_SYSTEM_PROMPT, NICHE_DEEPEN_SYSTEM_PROMPT } from "@/lib/agent/prompts";
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

    // ── Step 1: Web search for market data (staggered batches to avoid rate limits) ──
    let searchContext = "No web search data available — proceed with general knowledge.";

    try {
      const zai = await ZAI.create();

      // Helper: delay between batches
      const batchDelay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

      // Batch 1: Core market data (3 searches)
      const [searchResult1, searchResult2, searchResult3] = await Promise.allSettled([
        zai.functions.invoke("web_search", {
          query: `ebook ${effectiveSubNiche} market trends profitability 2024 2025`,
          num: 8,
        }),
        zai.functions.invoke("web_search", {
          query: `best selling ebooks ${effectiveSubNiche} ${niche} amazon kindle`,
          num: 8,
        }),
        zai.functions.invoke("web_search", {
          query: `${effectiveSubNiche} ebook reader demand audience pain points problems`,
          num: 8,
        }),
      ]);

      // Wait 2 seconds before next batch to avoid rate limiting
      await batchDelay(2000);

      // Batch 2: Competition & reviews (3 searches)
      const [searchResult4, searchResult5, searchResult6] = await Promise.allSettled([
        zai.functions.invoke("web_search", {
          query: `${effectiveSubNiche} niche competition analysis ebook digital product`,
          num: 8,
        }),
        zai.functions.invoke("web_search", {
          query: `${effectiveSubNiche} ebook reviews complaints what readers want`,
          num: 8,
        }),
        zai.functions.invoke("web_search", {
          query: `${effectiveSubNiche} ${niche} google trends market forecast 2025 2026`,
          num: 8,
        }),
      ]);

      // Wait 2 seconds before next batch
      await batchDelay(2000);

      // Batch 3: Community & revenue (3 searches)
      const [searchResult7, searchResult8, searchResult9] = await Promise.allSettled([
        zai.functions.invoke("web_search", {
          query: `${effectiveSubNiche} reddit forum community questions struggles`,
          num: 8,
        }),
        zai.functions.invoke("web_search", {
          query: `${effectiveSubNiche} online course udemy skillshare demand popularity`,
          num: 8,
        }),
        zai.functions.invoke("web_search", {
          query: `"${effectiveSubNiche}" ebook price revenue income self-publishing kdp`,
          num: 8,
        }),
      ]);

      const parts: string[] = [];
      const results = [
        { result: searchResult1, label: "Market Trends & Profitability" },
        { result: searchResult2, label: "Best Selling Ebooks" },
        { result: searchResult3, label: "Reader Demand & Pain Points" },
        { result: searchResult4, label: "Competition Analysis" },
        { result: searchResult5, label: "Reader Complaints & Wishes" },
        { result: searchResult6, label: "Trend Forecasting" },
        { result: searchResult7, label: "Community Discussions (Reddit/Forums)" },
        { result: searchResult8, label: "Course Demand (Udemy/Skillshare)" },
        { result: searchResult9, label: "Revenue & Pricing Data" },
      ];

      for (const { result, label } of results) {
        if (result.status === "fulfilled") {
          parts.push(`=== SEARCH RESULTS: ${label} ===\n${JSON.stringify(result.value, null, 2)}`);
        } else {
          console.warn(`[Niche Research] Search "${label}" failed:`, result.reason);
        }
      }

      if (parts.length > 0) {
        searchContext = parts.join("\n\n");
      }
    } catch (searchErr) {
      console.warn("[Niche Research] Web search failed entirely:", searchErr);
      // Continue without search data
    }

    // ── Step 2: First LLM analysis (broader pass) ────────────────
    const userMessage = [
      `Perform a DEEP analysis of the following niche for ebook profitability:`,
      ``,
      `Niche: ${niche}`,
      `Sub-Niche: ${effectiveSubNiche}`,
      customNiche ? `Custom Niche: ${customNiche}` : null,
      ``,
      `Here is REAL web search data to inform your analysis. Use specific data points from these results:`,
      searchContext,
      ``,
      `IMPORTANT: Base your scores on REAL evidence from the search data, not generic estimates. Reference specific numbers, titles, prices, and trends you found.`,
    ]
      .filter(Boolean)
      .join("\n");

    const nicheData = await createChatCompletionJSON<NicheResearchResult>(
      NICHE_RESEARCH_SYSTEM_PROMPT,
      userMessage
    );

    // ── Step 3: Second LLM pass for deeper analysis ────────────────
    let deepenedData = nicheData;
    try {
      const deepenMessage = [
        `You previously performed a niche analysis. Here is your initial result:`,
        ``,
        JSON.stringify(nicheData, null, 2),
        ``,
        `And here is the original search data for reference:`,
        searchContext.slice(0, 12000), // Limit context to avoid token overflow
        ``,
        `Now DEEPEN this analysis with a second pass. Specifically:`,
        `1. searchInsights: Expand with SPECIFIC data points — cite exact prices, book titles, search volumes, revenue figures, community sizes, Reddit discussions, course demand, or growth percentages you found in the search data. Make it 12-18 sentences with every claim backed by evidence.`,
        `2. suggestedSubNiches: For EACH sub-niche, provide more specific reasoning — why it's underserved, what specific gap exists, who the target reader is, estimate realistic monthly revenue potential ($X-$Y range), competition level, and differentiation angle.`,
        `3. profitability: If the search data shows specific revenue or price data, justify your score more precisely with dollar amounts.`,
        `4. demand: Reference specific search trends, Reddit subscriber counts, forum post counts, community sizes, or course enrollment data.`,
        ``,
        `Keep the same JSON structure but with MUCH more detailed, evidence-backed content. Include 5-8 suggested sub-niches.`,
      ].join("\n");

      deepenedData = await createChatCompletionJSON<NicheResearchResult>(
        NICHE_DEEPEN_SYSTEM_PROMPT,
        deepenMessage
      );
    } catch (deepenErr) {
      console.warn("[Niche Research] Deepening pass failed, using initial analysis:", deepenErr);
      // Fall back to the first-pass result
    }

    // Inject the niche/subNiche fields for consistency
    const result: NicheResearchResult = {
      niche,
      subNiche: effectiveSubNiche,
      customNiche: customNiche ?? null,
      profitability: deepenedData.profitability ?? nicheData.profitability ?? 5,
      demand: deepenedData.demand ?? nicheData.demand ?? 5,
      competition: deepenedData.competition ?? nicheData.competition ?? 5,
      potential: deepenedData.potential ?? nicheData.potential ?? 5,
      suggestedSubNiches: deepenedData.suggestedSubNiches ?? nicheData.suggestedSubNiches ?? [],
      searchInsights: deepenedData.searchInsights ?? nicheData.searchInsights ?? "No insights available.",
    };

    // ── Step 4: Save to database ────────────────────────────────────────
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
