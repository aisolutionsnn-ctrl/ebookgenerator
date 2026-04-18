import { NextRequest, NextResponse } from "next/server";
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

    // ── Web search skipped (ZAI disabled) ───────────────────────────────
    const searchContext = "Web search unavailable — proceed with general market knowledge.";
    const deepReadingContext = "";

    // ── Step 1: First LLM analysis (broader pass) ────────────────────
    const userMessage = [
      `Perform a DEEP analysis of the following niche for ebook profitability:`,
      ``,
      `Niche: ${niche}`,
      `Sub-Niche: ${effectiveSubNiche}`,
      customNiche ? `Custom Niche: ${customNiche}` : null,
      ``,
      `Here is context to inform your analysis:`,
      searchContext,
      ``,
      `IMPORTANT: Use your training knowledge to provide specific data points, realistic market estimates, competitor examples, pricing data, and market insights.`,
    ]
      .filter(Boolean)
      .join("\n");

    const nicheData = await createChatCompletionJSON<NicheResearchResult>(
      NICHE_RESEARCH_SYSTEM_PROMPT,
      userMessage
    );

    // ── Step 2: Second LLM pass for deeper analysis ──────────────────
    let deepenedData = nicheData;
    try {
      const deepenMessage = [
        `You previously performed a niche analysis. Here is your initial result:`,
        ``,
        JSON.stringify(nicheData, null, 2),
        ``,
        `Now DEEPEN this analysis with a second pass. Specifically:`,
        `1. searchInsights: Expand with SPECIFIC data points — cite realistic prices, book titles, search volumes, revenue figures, community sizes, or growth percentages. Make it 15-25 sentences with every claim backed by reasonable estimates. Include specific competitor book titles and their pricing, actual community sizes, real reader complaints, and concrete market gaps.`,
        `2. suggestedSubNiches: For EACH sub-niche, provide more specific reasoning — why it's underserved, what specific gap exists, who the target reader is, estimate realistic monthly revenue potential ($X-$Y range), competition level, and differentiation angle. Name specific competitors that are missing from this sub-niche.`,
        `3. profitability: Justify your score more precisely with dollar amounts and sales estimates.`,
        `4. demand: Reference specific trends, community sizes, or course enrollment data.`,
        ``,
        `Keep the same JSON structure but with MUCH more detailed, evidence-backed content. Include 6-10 suggested sub-niches.`,
        deepReadingContext,
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

    // ── Step 3: Save to database ─────────────────────────────────────
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
