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

    // ── Step 1: Web search for competition data ──────────────────────────
    let searchContext = "No web search data available — proceed with general knowledge.";
    let topUrls: string[] = [];

    try {
      const zai = await ZAI.create();

      const [searchResult1, searchResult2, searchResult3] = await Promise.allSettled([
        zai.functions.invoke("web_search", {
          query: `ebook ${subNiche} site:amazon.com OR site:gumroad.com OR site:payhip.com`,
          num: 10,
        }),
        zai.functions.invoke("web_search", {
          query: `best ${subNiche} ebooks buy price`,
          num: 10,
        }),
        zai.functions.invoke("web_search", {
          query: `${subNiche} ebook review rating complaints what missing`,
          num: 10,
        }),
      ]);

      const parts: string[] = [];
      const results = [
        { result: searchResult1, label: "Platform Listings" },
        { result: searchResult2, label: "Best Ebooks to Buy" },
        { result: searchResult3, label: "Reviews & Complaints" },
      ];

      const urlSet = new Set<string>();

      for (const { result, label } of results) {
        if (result.status === "fulfilled") {
          const raw = result.value;
          parts.push(`=== SEARCH RESULTS: ${label} ===\n${JSON.stringify(raw, null, 2)}`);

          // Extract URLs for web reading
          try {
            const searchResults = Array.isArray(raw) ? raw : (raw as { results?: unknown[] })?.results || [];
            for (const item of searchResults) {
              const url = (item as { url?: string; link?: string })?.url || (item as { url?: string; link?: string })?.link;
              if (url && typeof url === "string" && url.startsWith("http") && !url.includes("google.com/search")) {
                urlSet.add(url);
              }
            }
          } catch { /* ignore */ }
        } else {
          console.warn(`[Competition] Search "${label}" failed:`, result.reason);
        }
      }

      topUrls = Array.from(urlSet).slice(0, 4);

      if (parts.length > 0) {
        searchContext = parts.join("\n\n");
      }
    } catch (searchErr) {
      console.warn("[Competition] Web search failed entirely:", searchErr);
    }

    // ── Step 2: Deep web reading of top competitor pages ────────────────
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
            const truncated = content.slice(0, 3000);
            readParts.push(`=== COMPETITOR PAGE ${i + 1}: ${topUrls[i]} ===\n${truncated}`);
          }
        }

        if (readParts.length > 0) {
          deepReadingContext = readParts.join("\n\n");
          console.log(`[Competition] Read ${readParts.length}/${topUrls.length} competitor pages`);
        }
      }
    } catch (readErr) {
      console.warn("[Competition] Web reading failed (non-critical):", readErr);
    }

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
