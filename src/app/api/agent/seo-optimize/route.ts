/**
 * POST /api/agent/seo-optimize
 *
 * Agent 4: SEO & Sales Prep
 * Generates SEO titles, sales descriptions, tags, keywords, and pricing
 * suggestions for each book, using web search for keyword research.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createChatCompletionJSON } from "@/lib/openRouterClient";
import { SEO_SALES_SYSTEM_PROMPT } from "@/lib/agent/prompts";
import ZAI from "z-ai-web-dev-sdk";
import type {
  SeoSalesResult,
  SeoOptimizeRequest,
  CompetitionResult,
} from "@/lib/agent/types";

export async function POST(request: NextRequest) {
  try {
    const body: SeoOptimizeRequest = await request.json();
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
        console.warn("[SeoOptimize] Failed to parse competitionDataJson");
      }
    }

    // ── Initialize ZAI for web search ──────────────────────────────────
    let zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;
    try {
      zai = await ZAI.create();
    } catch (zaiErr) {
      console.warn("[SeoOptimize] ZAI init failed:", zaiErr);
    }

    // ── Process each book ──────────────────────────────────────────────
    const results: SeoSalesResult[] = [];

    for (const bookId of bookIds) {
      const book = await db.book.findUnique({
        where: { id: bookId },
        include: { chapters: { orderBy: { chapterNumber: "asc" } } },
      });

      if (!book) {
        console.warn(`[SeoOptimize] Book ${bookId} not found, skipping.`);
        continue;
      }

      const bookTitle = book.title ?? "Untitled";
      const chapterTitles = book.chapters
        .map((ch) => ch.title)
        .join(", ");

      // ── Web search for SEO keywords (resilient) ───────────────────────
      let searchKeywordData = "Web search unavailable — proceed with general SEO knowledge.";
      if (zai) {
        try {
          const [seoResults, popularResults] = await Promise.allSettled([
            zai.functions.invoke("web_search", {
              query: `seo keywords ${book.prompt} ebook`,
              num: 5,
            }),
            zai.functions.invoke("web_search", {
              query: `${book.prompt} popular search terms`,
              num: 5,
            }),
          ]);

          const parts: string[] = [];
          if (seoResults.status === "fulfilled") {
            parts.push("SEO Keywords Search Results:\n" + JSON.stringify(seoResults.value, null, 2));
          }
          if (popularResults.status === "fulfilled") {
            parts.push("Popular Search Terms Results:\n" + JSON.stringify(popularResults.value, null, 2));
          }
          if (parts.length > 0) {
            searchKeywordData = parts.join("\n\n");
          }
        } catch (searchErr) {
          console.warn(`[SeoOptimize] Web search failed for book ${bookId}:`, searchErr);
        }
      }

      // ── Competition pricing context ───────────────────────────────────
      const competitionPricing = competitionData
        ? `Average price: ${competitionData.averagePrice}, ` +
          `Price range: $${competitionData.priceRange.min}-$${competitionData.priceRange.max} ${competitionData.priceRange.currency}, ` +
          `Common formats: ${competitionData.commonFormats.join(", ")}`
        : "No competition pricing data available.";

      const userMessage = [
        `Book Title: ${bookTitle}`,
        `Subtitle: ${book.subtitle ?? "N/A"}`,
        `Topic/Prompt: ${book.prompt}`,
        `Audience: ${book.audience}`,
        "",
        `Chapter Titles: ${chapterTitles || "No chapters yet"}`,
        "",
        "Competition Pricing Context:",
        competitionPricing,
        "",
        "Search Keyword Data:",
        searchKeywordData,
      ].join("\n");

      try {
        const llmResult = await createChatCompletionJSON<{
          seoTitle: string;
          seoDescription: string;
          tags: string[];
          keywords: string[];
          pricing: SeoSalesResult["pricing"];
          payhipChecklist: string[];
          categorySuggestion: string;
        }>(SEO_SALES_SYSTEM_PROMPT, userMessage);

        const seoResult: SeoSalesResult = {
          bookId,
          bookTitle,
          seoTitle: llmResult.seoTitle,
          seoDescription: llmResult.seoDescription,
          tags: llmResult.tags,
          keywords: llmResult.keywords,
          pricing: llmResult.pricing,
          payhipChecklist: llmResult.payhipChecklist,
          categorySuggestion: llmResult.categorySuggestion,
        };

        results.push(seoResult);
      } catch (llmErr) {
        console.error(`[SeoOptimize] LLM failed for book ${bookId}:`, llmErr);
        results.push({
          bookId,
          bookTitle,
          seoTitle: bookTitle,
          seoDescription: "",
          tags: [],
          keywords: [],
          pricing: {
            suggested: 9.99,
            minimum: 4.99,
            premium: 14.99,
            currency: "USD",
            launchPromo: null,
          },
          payhipChecklist: ["SEO generation failed — retry recommended."],
          categorySuggestion: "",
        });
      }
    }

    // ── Update session ─────────────────────────────────────────────────
    await db.agentSession.update({
      where: { id: sessionId },
      data: {
        seoDataJson: JSON.stringify(results),
        currentStep: 4,
      },
    });

    return NextResponse.json({ results });
  } catch (err: unknown) {
    console.error("[API] POST /api/agent/seo-optimize error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
