import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Helper: parse all JSON fields on an AgentSession row so the API returns
 * proper objects instead of raw JSON strings.
 */
function parseSession(raw: Awaited<ReturnType<typeof db.agentSession.findMany>>[number]) {
  return {
    id: raw.id,
    userId: raw.userId,
    niche: raw.niche,
    subNiche: raw.subNiche,
    customNiche: raw.customNiche,
    bookCount: raw.bookCount,
    currentStep: raw.currentStep,
    status: raw.status,
    nicheData: raw.nicheDataJson ? JSON.parse(raw.nicheDataJson) : null,
    competitionData: raw.competitionDataJson ? JSON.parse(raw.competitionDataJson) : null,
    evaluationData: raw.evaluationDataJson ? JSON.parse(raw.evaluationDataJson) : null,
    seoData: raw.seoDataJson ? JSON.parse(raw.seoDataJson) : null,
    coverData: raw.coverDataJson ? JSON.parse(raw.coverDataJson) : null,
    generatedBookIds: raw.generatedBookIds ? JSON.parse(raw.generatedBookIds) : [],
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/**
 * GET /api/agent/sessions
 * Returns all agent sessions ordered by newest first.
 */
export async function GET() {
  try {
    const sessions = await db.agentSession.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      sessions: sessions.map(parseSession),
    });
  } catch (error) {
    console.error("[Sessions List API] Error:", error);
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
