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

    // ── Step 1: Web search for market data (staggered batches) ──────────
    let searchContext = "No web search data available — proceed with general knowledge.";
    let topUrls: string[] = [];

    try {
      const zai = await ZAI.create();

      const batchDelay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

      // Batch 1: Core market data (3 searches)
      const [searchResult1, searchResult2, searchResult3] = await Promise.allSettled([
        zai.functions.invoke("web_search", {
          query: `ebook ${effectiveSubNiche} market trends profitability 2024 2025`,
          num: 10,
        }),
        zai.functions.invoke("web_search", {
          query: `best selling ebooks ${effectiveSubNiche} ${niche} amazon kindle`,
          num: 10,
        }),
        zai.functions.invoke("web_search", {
          query: `${effectiveSubNiche} ebook reader demand audience pain points problems`,
          num: 10,
        }),
      ]);

      await batchDelay(2000);

      // Batch 2: Competition & reviews (3 searches)
      const [searchResult4, searchResult5, searchResult6] = await Promise.allSettled([
        zai.functions.invoke("web_search", {
          query: `${effectiveSubNiche} niche competition analysis ebook digital product`,
          num: 10,
        }),
        zai.functions.invoke("web_search", {
          query: `${effectiveSubNiche} ebook reviews complaints what readers want`,
          num: 10,
        }),
        zai.functions.invoke("web_search", {
          query: `${effectiveSubNiche} ${niche} google trends market forecast 2025 2026`,
          num: 10,
        }),
      ]);

      await batchDelay(2000);

      // Batch 3: Community & revenue (3 searches)
      const [searchResult7, searchResult8, searchResult9] = await Promise.allSettled([
        zai.functions.invoke("web_search", {
          query: `${effectiveSubNiche} reddit forum community questions struggles`,
          num: 10,
        }),
        zai.functions.invoke("web_search", {
          query: `${effectiveSubNiche} online course udemy skillshare demand popularity`,
          num: 10,
        }),
        zai.functions.invoke("web_search", {
          query: `"${effectiveSubNiche}" ebook price revenue income self-publishing kdp`,
          num: 10,
        }),
      ]);

      await batchDelay(1500);

      // Batch 4: Deeper competitive intel (2 searches)
      const [searchResult10, searchResult11] = await Promise.allSettled([
        zai.functions.invoke("web_search", {
          query: `${effectiveSubNiche} ebook free sample table of contents chapter list`,
          num: 8,
        }),
        zai.functions.invoke("web_search", {
          query: `${effectiveSubNiche} "book review" OR "book summary" OR "reader feedback" 2024 2025`,
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
        { result: searchResult10, label: "Competitor Book Structure" },
        { result: searchResult11, label: "Reader Feedback & Reviews" },
      ];

      // Collect URLs from search results for web reading
      const urlSet = new Set<string>();

      for (const { result, label } of results) {
        if (result.status === "fulfilled") {
          const raw = result.value;
          parts.push(`=== SEARCH RESULTS: ${label} ===\n${JSON.stringify(raw, null, 2)}`);

          // Extract URLs from search results for web reading
          try {
            const searchResults = Array.isArray(raw) ? raw : (raw as { results?: unknown[] })?.results || [];
            for (const item of searchResults) {
              const url = (item as { url?: string; link?: string })?.url || (item as { url?: string; link?: string })?.link;
              if (url && typeof url === "string" && url.startsWith("http") && !url.includes("google.com/search") && !url.includes("bing.com/search")) {
                urlSet.add(url);
              }
            }
          } catch { /* ignore URL extraction errors */ }
        } else {
          console.warn(`[Niche Research] Search "${label}" failed:`, result.reason);
        }
      }

      topUrls = Array.from(urlSet).slice(0, 5); // Read top 5 most relevant pages

      if (parts.length > 0) {
        searchContext = parts.join("\n\n");
      }
    } catch (searchErr) {
      console.warn("[Niche Research] Web search failed entirely:", searchErr);
    }

    // ── Step 2: Deep web reading of top results ──────────────────────
    let deepReadingContext = "";
    try {
      if (topUrls.length > 0) {
        const zai = await ZAI.create();
        const readResults = await Promise.allSettled(
          topUrls.map((url) =>
            zai.functions.invoke("web_reader", { url })
          )
        );

        const readParts: string[] = [];
        for (let i = 0; i < readResults.length; i++) {
          const rr = readResults[i];
          if (rr.status === "fulfilled") {
            const content = typeof rr.value === "string" ? rr.value : JSON.stringify(rr.value);
            // Truncate each page to 3000 chars to keep context manageable
            const truncated = content.slice(0, 3000);
            readParts.push(`=== WEB PAGE ${i + 1}: ${topUrls[i]} ===\n${truncated}`);
          }
        }

        if (readParts.length > 0) {
          deepReadingContext = readParts.join("\n\n");
          console.log(`[Niche Research] Read ${readParts.length}/${topUrls.length} web pages for deeper analysis`);
        }
      }
    } catch (readErr) {
      console.warn("[Niche Research] Web reading failed (non-critical):", readErr);
    }

    // ── Step 3: First LLM analysis (broader pass) ────────────────────
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
      deepReadingContext ? `Here is DEEPER content from reading the most relevant web pages. Extract specific facts, numbers, prices, competitor names, and market insights:` : null,
      deepReadingContext || null,
      ``,
      `IMPORTANT: Base your scores on REAL evidence from the search data and web pages. Reference specific numbers, titles, prices, and trends you found. Cite competitor book titles, actual Reddit discussions, real pricing data, and concrete market statistics.`,
    ]
      .filter(Boolean)
      .join("\n");

    const nicheData = await createChatCompletionJSON<NicheResearchResult>(
      NICHE_RESEARCH_SYSTEM_PROMPT,
      userMessage
    );

    // ── Step 4: Second LLM pass for deeper analysis ──────────────────
    let deepenedData = nicheData;
    try {
      const deepenMessage = [
        `You previously performed a niche analysis. Here is your initial result:`,
        ``,
        JSON.stringify(nicheData, null, 2),
        ``,
        `And here is the original search data for reference:`,
        searchContext.slice(0, 10000), // Limit context to avoid token overflow
        ``,
        deepReadingContext ? `Additional deep reading content from web pages:` : null,
        deepReadingContext ? deepReadingContext.slice(0, 8000) : null,
        ``,
        `Now DEEPEN this analysis with a second pass. Specifically:`,
        `1. searchInsights: Expand with SPECIFIC data points — cite exact prices, book titles, search volumes, revenue figures, community sizes, Reddit discussions, course demand, or growth percentages you found in the search data AND the web pages. Make it 15-25 sentences with every claim backed by evidence. Include specific competitor book titles and their pricing, actual community sizes, real reader complaints, and concrete market gaps.`,
        `2. suggestedSubNiches: For EACH sub-niche, provide more specific reasoning — why it's underserved, what specific gap exists, who the target reader is, estimate realistic monthly revenue potential ($X-$Y range), competition level, and differentiation angle. Name specific competitors that are missing from this sub-niche.`,
        `3. profitability: If the search data shows specific revenue or price data, justify your score more precisely with dollar amounts and sales estimates.`,
        `4. demand: Reference specific search trends, Reddit subscriber counts, forum post counts, community sizes, or course enrollment data.`,
        ``,
        `Keep the same JSON structure but with MUCH more detailed, evidence-backed content. Include 6-10 suggested sub-niches.`,
      ].filter(Boolean).join("\n");

      deepenedData = await createChatCompletionJSON<NicheResearchResult>(
        NICHE_DEEPEN_SYSTEM_PROMPT,
        deepenMessage
      );
    } catch (deepenErr) {
      console.warn("[Niche Research] Deepening pass failed, using initial analysis:", deepenErr);
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

    // ── Step 5: Save to database ─────────────────────────────────────
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
